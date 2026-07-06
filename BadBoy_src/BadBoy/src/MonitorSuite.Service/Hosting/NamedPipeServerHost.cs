using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MonitorSuite.Service.Monitoring;
using MonitorSuite.Service.Security;
using MonitorSuite.Shared.Config;
using MonitorSuite.Shared.Contracts;
using MonitorSuite.Shared.Data;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Hosting;

internal sealed class NamedPipeServerHost(
    ILogger<NamedPipeServerHost> logger,
    ICredentialValidator credentialValidator,
    IAdminSessionManager sessionManager,
    MicrosoftGraphValidator microsoftGraphValidator,
    LatestVisibleWindowsStore visibleWindowsStore,
    PipeQueryGate queryGate,
    AgentStatusStore agentStatusStore,
    IMonitoringSessionAccessor sessionAccessor,
    IDbContextFactory<MonitorDbContext> dbContextFactory)
{
    private const string PipeName = "MonitorSuitePipe";

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await RunPipeLoopAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Named pipe server crashed; reiniciando en 3 s.");
                await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
            }
        }
    }

    private async Task RunPipeLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var pipeServer = new NamedPipeServerStream(
                PipeName,
                PipeDirection.InOut,
                1,
                PipeTransmissionMode.Byte,
                PipeOptions.None);

            try
            {
                await pipeServer.WaitForConnectionAsync(cancellationToken);
                await HandleClientAsync(pipeServer, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                pipeServer.Dispose();
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error while accepting pipe connection.");
                pipeServer.Dispose();
            }
        }
    }

    private async Task HandleClientAsync(NamedPipeServerStream pipe, CancellationToken cancellationToken)
    {
        await using var connection = pipe;

        var line = await Task.Run(() =>
        {
            using var reader = new StreamReader(connection, Encoding.UTF8, leaveOpen: true);
            return reader.ReadLine();
        }, cancellationToken);

        if (string.IsNullOrWhiteSpace(line))
        {
            return;
        }

        var response = await ProcessMessageAsync(line, cancellationToken);

        await Task.Run(() =>
        {
            using var writer = new StreamWriter(connection, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };
            writer.WriteLine(response);
        }, cancellationToken);
    }

    private async Task<string> ProcessMessageAsync(string payload, CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;

        if (!root.TryGetProperty("type", out var typeElement))
        {
            return JsonSerializer.Serialize(new { error = "MissingType" });
        }

        var type = typeElement.GetString();
        return type switch
        {
            "agentStatus" => HandleAgentStatus(),
            "login" => await HandleLoginAsync(root, cancellationToken),
            "microsoftLogin" => await HandleMicrosoftLoginAsync(root, cancellationToken),
            "usageReport" => await HandleUsageReportAsync(root, cancellationToken),
            "liveState" => await HandleLiveStateAsync(root, cancellationToken),
            "logout" => HandleLogout(root),
            _ => JsonSerializer.Serialize(new { error = "UnknownType" })
        };
    }

    private string HandleAgentStatus()
    {
        var (nexusEnabled, lastOk, lastUtc, lastMsg) = agentStatusStore.Snapshot();
        var payload = new AgentRuntimeStatus(
            AgentRunning: true,
            NexusEnabled: nexusEnabled,
            LastNexusSyncOk: lastOk,
            LastNexusSyncUtc: lastUtc,
            LastNexusMessage: lastMsg,
            HasActiveSession: sessionAccessor.CurrentSessionId.HasValue,
            CurrentApplication: null,
            MachineName: Environment.MachineName,
            DisplayName: MachineProfileStore.ResolveDisplayName());

        return JsonSerializer.Serialize(new { type = "agentStatusResponse", payload });
    }

    private async Task<string> HandleLoginAsync(JsonElement root, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Deserialize<AdminLoginRequest>(root.GetProperty("payload").GetRawText());
        if (request is null)
        {
            return JsonSerializer.Serialize(new { error = "InvalidPayload" });
        }

        var valid = await credentialValidator.ValidateAsync(request.Username, request.Password, request.OneTimeCode, cancellationToken);

        if (!valid)
        {
            return JsonSerializer.Serialize(new { type = "loginResponse", payload = new AdminLoginResponse(false, "Invalid credentials", null) });
        }

        var token = await sessionManager.IssueAsync(request.Username, cancellationToken);
        var response = new AdminLoginResponse(true, null, token, request.Username);
        return JsonSerializer.Serialize(new { type = "loginResponse", payload = response });
    }

    private async Task<string> HandleMicrosoftLoginAsync(JsonElement root, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Deserialize<AdminMicrosoftLoginRequest>(root.GetProperty("payload").GetRawText());
        if (request is null || string.IsNullOrWhiteSpace(request.AccessToken))
        {
            return JsonSerializer.Serialize(new { error = "InvalidPayload" });
        }

        var (ok, email, error) = await microsoftGraphValidator.ValidateAccessTokenAsync(request.AccessToken, cancellationToken);
        if (!ok || string.IsNullOrWhiteSpace(email))
        {
            return JsonSerializer.Serialize(new
            {
                type = "loginResponse",
                payload = new AdminLoginResponse(false, error ?? "Microsoft login failed", null)
            });
        }

        var token = await sessionManager.IssueAsync(email, cancellationToken);
        return JsonSerializer.Serialize(new
        {
            type = "loginResponse",
            payload = new AdminLoginResponse(true, null, token, email)
        });
    }

    private string HandleLogout(JsonElement root)
    {
        var request = JsonSerializer.Deserialize<AdminLogoutRequest>(root.GetProperty("payload").GetRawText());
        if (request is null)
        {
            return JsonSerializer.Serialize(new { error = "InvalidPayload" });
        }

        sessionManager.Revoke(request.SessionToken);
        return JsonSerializer.Serialize(new { type = "logoutResponse", payload = "ok" });
    }

    private async Task<string> HandleUsageReportAsync(JsonElement root, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Deserialize<UsageReportRequest>(root.GetProperty("payload").GetRawText());
        if (request is null)
        {
            return JsonSerializer.Serialize(new { error = "InvalidPayload" });
        }

        if (!sessionManager.Validate(request.SessionToken))
        {
            return JsonSerializer.Serialize(new { error = "Unauthorized" });
        }

        return await queryGate.RunAsync(async () =>
        {
            await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

            var from = new DateTimeOffset(request.From.ToDateTime(TimeOnly.MinValue));
            var to = new DateTimeOffset(request.To.ToDateTime(TimeOnly.MaxValue).AddDays(1).AddTicks(-1));

            var sessionIds = (await dbContext.Sessions.ToListAsync(cancellationToken))
                .Where(s => s.SessionStart <= to && (s.SessionEnd ?? DateTimeOffset.UtcNow) >= from)
                .Select(s => s.Id)
                .ToHashSet();

            var allSlices = await dbContext.ApplicationSlices.ToListAsync(cancellationToken);
            var slicesInRange = allSlices
                .Where(x => sessionIds.Contains(x.SessionId) && x.Start <= to && x.End >= from)
                .OrderByDescending(x => x.Start)
                .Take(3000)
                .ToList();

        var applicationDetails = slicesInRange
            .Select(x => new ApplicationActivityDetail
            {
                Start = x.Start,
                End = x.End,
                ProcessName = x.ProcessName,
                WindowTitle = x.DisplayName,
                Duration = x.End - x.Start
            })
            .Take(200)
            .ToList();

        var summaries = slicesInRange
            .Select(x => new
            {
                x.SessionId,
                x.DisplayName,
                x.ProcessName,
                Duration = x.End - x.Start
            })
            .ToList();

        var grouped = summaries
            .GroupBy(x => string.IsNullOrWhiteSpace(x.DisplayName) ? x.ProcessName : x.DisplayName)
            .Select(g => new UsageSliceAggregate
            {
                Application = g.Key,
                ActiveTime = g.Select(y => y.Duration).Aggregate(TimeSpan.Zero, (a, b) => a + b),
                Percentage = 0
            })
            .ToList();

        var totalActive = grouped.Select(x => x.ActiveTime).Aggregate(TimeSpan.Zero, (a, b) => a + b);
        foreach (var app in grouped)
        {
            app.Percentage = totalActive.TotalMinutes > 0
                ? app.ActiveTime.TotalMinutes / totalActive.TotalMinutes * 100
                : 0;
        }

        var allBrowser = await dbContext.BrowserEntries.ToListAsync(cancellationToken);
        var browserInRange = allBrowser
            .Where(x => sessionIds.Contains(x.SessionId) && x.Timestamp >= from && x.Timestamp <= to)
            .OrderByDescending(x => x.Timestamp)
            .Take(500)
            .ToList();

        var urlDetails = BuildUrlDetails(browserInRange);

        var dailyBreakdown = slicesInRange
            .GroupBy(x => DateOnly.FromDateTime(x.Start.LocalDateTime))
            .Select(g =>
            {
                var topApp = g
                    .GroupBy(x => string.IsNullOrWhiteSpace(x.DisplayName) ? x.ProcessName : x.DisplayName)
                    .Select(x => new { Name = x.Key, Minutes = x.Sum(y => (y.End - y.Start).TotalMinutes) })
                    .OrderByDescending(x => x.Minutes)
                    .FirstOrDefault();

                return new DailyUsagePoint(
                    g.Key,
                    g.Sum(x => (x.End - x.Start).TotalHours),
                    topApp?.Name ?? "—");
            })
            .OrderBy(x => x.Date)
            .ToList();

        var response = new UsageReportResponse(
            Array.Empty<DailyUsageSummary>(),
            totalActive,
            TimeSpan.Zero,
            TimeSpan.Zero);

        return JsonSerializer.Serialize(new
        {
            type = "usageReportResponse",
            payload = response,
            applications = grouped,
            applicationDetails,
            urlDetails,
            dailyBreakdown
        });
        }, cancellationToken);
    }

    private static List<BrowserVisitDetail> BuildUrlDetails(List<BrowserActivityEntry> entries)
    {
        if (entries.Count == 0)
        {
            return [];
        }

        var ordered = entries.OrderBy(x => x.Timestamp).ToList();
        var details = new List<BrowserVisitDetail>(ordered.Count);

        for (var i = 0; i < ordered.Count; i++)
        {
            var current = ordered[i];
            var next = i + 1 < ordered.Count ? ordered[i + 1] : null;
            var duration = current.Duration ?? (next is not null
                ? next.Timestamp - current.Timestamp
                : TimeSpan.FromSeconds(30));

            if (duration <= TimeSpan.Zero)
            {
                duration = TimeSpan.FromSeconds(30);
            }

            details.Add(new BrowserVisitDetail
            {
                Timestamp = current.Timestamp,
                Browser = current.Browser,
                Url = string.IsNullOrWhiteSpace(current.Url) ? "(sin URL — instale extensión)" : current.Url,
                Title = current.Title,
                Duration = duration
            });
        }

        return details.OrderByDescending(x => x.Timestamp).Take(200).ToList();
    }

    private async Task<string> HandleLiveStateAsync(JsonElement root, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Deserialize<LiveSessionStateRequest>(root.GetProperty("payload").GetRawText());
        if (request is null)
        {
            return JsonSerializer.Serialize(new { error = "InvalidPayload" });
        }

        if (!sessionManager.Validate(request.SessionToken))
        {
            return JsonSerializer.Serialize(new { error = "Unauthorized" });
        }

        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        var sessions = await dbContext.Sessions.ToListAsync(cancellationToken);
        var latestSession = sessions.OrderByDescending(x => x.SessionStart).FirstOrDefault();

        if (latestSession is null)
        {
            return JsonSerializer.Serialize(new { type = "liveStateResponse", payload = (LiveSessionStateResponse?)null });
        }

        var slices = await dbContext.ApplicationSlices
            .Where(x => x.SessionId == latestSession.Id)
            .ToListAsync(cancellationToken);
        var latestSlice = slices.OrderByDescending(x => x.End).FirstOrDefault();

        var snapshots = await dbContext.InputSnapshots
            .Where(x => x.SessionId == latestSession.Id)
            .ToListAsync(cancellationToken);
        var idleSnapshot = snapshots.OrderByDescending(x => x.CapturedAt).FirstOrDefault();

        var browserEntries = await dbContext.BrowserEntries
            .Where(x => x.SessionId == latestSession.Id)
            .ToListAsync(cancellationToken);
        var latestBrowser = browserEntries.OrderByDescending(x => x.Timestamp).FirstOrDefault();

        string? currentUrl = null;
        if (latestSlice is not null && BrowserHelper.IsBrowser(latestSlice.ProcessName))
        {
            currentUrl = latestBrowser is not null && !string.IsNullOrWhiteSpace(latestBrowser.Url)
                ? latestBrowser.Url
                : BrowserHelper.ParsePageTitle(latestSlice.DisplayName, latestSlice.ProcessName);
        }

        List<string>? openWindows = null;
        var cached = visibleWindowsStore.Get(latestSession.Id);
        if (cached is not null)
        {
            openWindows = cached.Value.Windows
                .OrderByDescending(x => x.IsForeground)
                .ThenBy(x => x.ProcessName)
                .Select(x => x.IsForeground
                    ? $"▶ [{x.ProcessName}] {x.WindowTitle}"
                    : $"  [{x.ProcessName}] {x.WindowTitle}")
                .Take(25)
                .ToList();
        }

        var payload = new LiveSessionStateResponse(
            latestSession.MachineName,
            latestSession.UserPrincipalName,
            latestSession.Status,
            latestSession.SessionStart,
            DateTimeOffset.UtcNow - latestSession.SessionStart,
            latestSlice?.DisplayName,
            currentUrl,
            idleSnapshot?.IdleDuration ?? TimeSpan.Zero,
            MachineProfileStore.ResolveDisplayName(),
            openWindows);

        return JsonSerializer.Serialize(new { type = "liveStateResponse", payload });
    }
}


