using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

/// <summary>
/// Registra pestañas/páginas del navegador en primer plano (título de ventana).
/// Las URLs exactas llegan vía extensión del navegador (BrowserBridgeHostedService).
/// </summary>
internal sealed class BrowserForegroundTracker(
    ILogger<BrowserForegroundTracker> logger,
    IBrowserActivitySink sink,
    IMonitoringSessionAccessor sessionAccessor)
{
    private BrowserActivityEntry? _currentEntry;
    private string? _lastKey;

    public async Task ObserveAsync(ApplicationUsageSlice slice, CancellationToken cancellationToken)
    {
        if (!BrowserHelper.IsBrowser(slice.ProcessName))
        {
            await FinalizeCurrentAsync(cancellationToken);
            _lastKey = null;
            return;
        }

        var sessionId = sessionAccessor.CurrentSessionId;
        if (sessionId is null)
        {
            return;
        }

        var pageTitle = BrowserHelper.ParsePageTitle(slice.DisplayName, slice.ProcessName);
        var key = $"{slice.ProcessName}|{pageTitle}";

        if (_lastKey == key && _currentEntry is not null)
        {
            _currentEntry.Duration = DateTimeOffset.UtcNow - _currentEntry.Timestamp;
            return;
        }

        await FinalizeCurrentAsync(cancellationToken);

        var url = BrowserHelper.TryExtractUrl(slice.DisplayName, out var extracted)
            ? extracted
            : string.Empty;

        _currentEntry = new BrowserActivityEntry
        {
            SessionId = sessionId.Value,
            Browser = BrowserHelper.ResolveBrowserName(slice.ProcessName),
            Url = url,
            Title = pageTitle,
            Timestamp = slice.Start,
            Duration = TimeSpan.Zero
        };
        _lastKey = key;

        await sink.RecordAsync(_currentEntry, cancellationToken);
        logger.LogDebug("Browser tab recorded: {Browser} {Title}", _currentEntry.Browser, _currentEntry.Title);
    }

    public async Task FinalizeCurrentAsync(CancellationToken cancellationToken)
    {
        if (_currentEntry is null)
        {
            return;
        }

        _currentEntry.Duration = DateTimeOffset.UtcNow - _currentEntry.Timestamp;
        _currentEntry = null;
    }
}
