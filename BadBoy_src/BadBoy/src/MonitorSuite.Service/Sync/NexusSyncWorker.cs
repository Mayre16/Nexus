using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MonitorSuite.Service.Hosting;
using MonitorSuite.Shared.Config;
using MonitorSuite.Shared.Data;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Sync;

/// <summary>
/// Configuración del enlace con ADESA Nexus (Nexus Tracker).
/// Archivo: %PROGRAMDATA%\MonitorSuite\Config\nexus.json
/// </summary>
internal sealed class NexusSyncConfig
{
    public string NexusApiUrl { get; set; } = "http://localhost:3000";
    public string DeviceUuid { get; set; } = string.Empty;
    public string ApiSecret { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
    public int IntervalMinutes { get; set; } = 5;

    public static string ConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MonitorSuite", "Config", "nexus.json");

    public static NexusSyncConfig? Load()
    {
        if (!File.Exists(ConfigPath))
        {
            return null;
        }

        var json = File.ReadAllText(ConfigPath);
        return JsonSerializer.Deserialize<NexusSyncConfig>(json, JsonOptions);
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };
}

/// <summary>
/// Envía lotes de telemetría cada N minutos a POST /api/performance/log (Nexus Tracker).
/// </summary>
internal sealed class NexusSyncWorker(
    ILogger<NexusSyncWorker> logger,
    IDbContextFactory<MonitorDbContext> dbContextFactory,
    AgentStatusStore agentStatusStore)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Espera inicial para que MonitorWorker arranque y genere datos.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var config = NexusSyncConfig.Load();
            if (config is null || !config.Enabled || string.IsNullOrWhiteSpace(config.DeviceUuid))
            {
                agentStatusStore.SetNexusConfig(false);
                logger.LogDebug("Nexus sync deshabilitado o sin nexus.json en {Path}", NexusSyncConfig.ConfigPath);
            }
            else
            {
                agentStatusStore.SetNexusConfig(true);
                try
                {
                    await EnviarLoteAsync(config, stoppingToken);
                    agentStatusStore.RecordNexusSync(true, "Reporte enviado a Nexus");
                }
                catch (Exception ex)
                {
                    agentStatusStore.RecordNexusSync(false, ex.Message);
                    logger.LogWarning(ex, "Fallo al sincronizar con Nexus Tracker.");
                }
            }

            var interval = config?.IntervalMinutes ?? 5;
            await Task.Delay(TimeSpan.FromMinutes(Math.Max(1, interval)), stoppingToken);
        }
    }

    private async Task EnviarLoteAsync(NexusSyncConfig config, CancellationToken cancellationToken)
    {
        var periodEnd = DateTimeOffset.UtcNow;
        var periodStart = periodEnd.AddMinutes(-config.IntervalMinutes);

        await using var db = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        // SQLite no soporta ORDER BY ni filtros con DateTimeOffset — todo en memoria.
        var allSessions = await db.Sessions.ToListAsync(cancellationToken);
        var session = allSessions
            .OrderByDescending(s => s.SessionStart)
            .FirstOrDefault(s => s.SessionEnd == null || s.SessionEnd >= periodStart);

        if (session is null)
        {
            logger.LogDebug("Sin sesión activa para sincronizar.");
            return;
        }

        var slices = (await db.ApplicationSlices
            .Where(s => s.SessionId == session.Id)
            .ToListAsync(cancellationToken))
            .Where(s => s.End >= periodStart)
            .ToList();

        var snapshots = (await db.InputSnapshots
            .Where(s => s.SessionId == session.Id)
            .ToListAsync(cancellationToken))
            .Where(s => s.CapturedAt >= periodStart)
            .ToList();

        var urls = (await db.BrowserEntries
            .Where(b => b.SessionId == session.Id)
            .ToListAsync(cancellationToken))
            .Where(b => b.Timestamp >= periodStart)
            .ToList();

        var apps = slices
            .GroupBy(s => new { s.ProcessName, s.DisplayName })
            .Select(g => new
            {
                processName = g.Key.ProcessName,
                displayName = g.Key.DisplayName,
                seconds = (int)g.Sum(x => Math.Max(0, (x.End - x.Start).TotalSeconds)),
                hadUserInput = g.Any(x => x.HadUserInput)
            })
            .Where(a => a.seconds > 0)
            .OrderByDescending(a => a.seconds)
            .Take(50)
            .ToList();

        var urlPayload = urls
            .Select(u => new
            {
                browser = u.Browser,
                url = u.Url,
                title = u.Title,
                seconds = u.Duration.HasValue ? (int)u.Duration.Value.TotalSeconds : 60
            })
            .Take(30)
            .ToList();

        var idleSeconds = snapshots.Count > 0
            ? (int)snapshots.Average(s => s.IdleDuration.TotalSeconds)
            : 0;
        var activeSeconds = Math.Max(0, (int)(periodEnd - periodStart).TotalSeconds - idleSeconds);

        var payload = new
        {
            periodStart = periodStart.UtcDateTime.ToString("o"),
            periodEnd = periodEnd.UtcDateTime.ToString("o"),
            machineName = session.MachineName,
            windowsUser = session.UserPrincipalName,
            displayName = MachineProfileStore.ResolveDisplayName(),
            sessionStatus = session.Status.ToString(),
            activeSeconds,
            idleSeconds,
            apps,
            urls = urlPayload
        };

        var bodyJson = JsonSerializer.Serialize(payload);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var signature = ComputeHmac(config.ApiSecret, $"{timestamp}.{bodyJson}");

        using var client = new HttpClient { BaseAddress = new Uri(config.NexusApiUrl.TrimEnd('/') + "/") };
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/performance/log");
        request.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
        request.Headers.Add("X-Device-Uuid", config.DeviceUuid);
        request.Headers.Add("X-Timestamp", timestamp);
        request.Headers.Add("X-Signature", signature);

        var response = await client.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            logger.LogInformation("Reporte enviado a Nexus Tracker ({Status}).", response.StatusCode);
        }
        else
        {
            var err = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Nexus rechazó el reporte: {Status} {Body}", response.StatusCode, err);
            throw new InvalidOperationException($"Nexus {response.StatusCode}: {err}");
        }
    }

    private static string ComputeHmac(string secret, string payload)
    {
        using var hmac = new System.Security.Cryptography.HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
