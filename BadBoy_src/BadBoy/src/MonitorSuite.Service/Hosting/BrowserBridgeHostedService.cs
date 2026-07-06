using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MonitorSuite.Service.Monitoring;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Hosting;

/// <summary>
/// Recibe URLs exactas desde la extensión Chrome/Edge (localhost:19642).
/// </summary>
internal sealed class BrowserBridgeHostedService(
    ILogger<BrowserBridgeHostedService> logger,
    IMonitoringSessionAccessor sessionAccessor,
    IBrowserActivitySink sink) : BackgroundService
{
    private const string Prefix = "http://127.0.0.1:19642/";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!HttpListener.IsSupported)
        {
            logger.LogWarning("HttpListener no disponible; URLs exactas requieren extensión manual.");
            return;
        }

        using var listener = new HttpListener();
        listener.Prefixes.Add(Prefix);

        try
        {
            listener.Start();
            logger.LogInformation("Browser bridge escuchando en {Prefix}", Prefix);
        }
        catch (HttpListenerException ex)
        {
            logger.LogWarning(ex, "No se pudo iniciar browser bridge en {Prefix}", Prefix);
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var context = await listener.GetContextAsync().WaitAsync(stoppingToken);
                _ = HandleRequestAsync(context, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Error en browser bridge.");
            }
        }

        listener.Stop();
    }

    private async Task HandleRequestAsync(HttpListenerContext context, CancellationToken cancellationToken)
    {
        var response = context.Response;
        try
        {
            var path = context.Request.Url?.AbsolutePath ?? string.Empty;
            if (context.Request.HttpMethod != "POST" ||
                !path.Equals("/browser-visit", StringComparison.OrdinalIgnoreCase))
            {
                response.StatusCode = 404;
                response.Close();
                return;
            }

            using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
            var body = await reader.ReadToEndAsync(cancellationToken);
            var visit = JsonSerializer.Deserialize<BrowserVisitPayload>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (visit is null || string.IsNullOrWhiteSpace(visit.Url))
            {
                response.StatusCode = 400;
                response.Close();
                return;
            }

            var sessionId = sessionAccessor.CurrentSessionId;
            if (sessionId is null)
            {
                response.StatusCode = 503;
                await WriteJsonAsync(response, new { ok = false, error = "NoActiveSession" });
                return;
            }

            var entry = new BrowserActivityEntry
            {
                SessionId = sessionId.Value,
                Browser = string.IsNullOrWhiteSpace(visit.Browser) ? "Chrome" : visit.Browser.Trim(),
                Url = visit.Url.Trim(),
                Title = visit.Title?.Trim() ?? visit.Url.Trim(),
                Timestamp = DateTimeOffset.UtcNow,
                Duration = TimeSpan.Zero
            };
            await sink.RecordAsync(entry, cancellationToken);
            await WriteJsonAsync(response, new { ok = true });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Fallo al procesar browser-visit.");
            response.StatusCode = 500;
            response.Close();
        }
    }

    private static async Task WriteJsonAsync(HttpListenerResponse response, object payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        response.ContentType = "application/json";
        response.ContentLength64 = bytes.Length;
        await response.OutputStream.WriteAsync(bytes);
        response.Close();
    }

    private sealed class BrowserVisitPayload
    {
        public string Url { get; set; } = string.Empty;

        public string? Title { get; set; }

        public string? Browser { get; set; }
    }
}
