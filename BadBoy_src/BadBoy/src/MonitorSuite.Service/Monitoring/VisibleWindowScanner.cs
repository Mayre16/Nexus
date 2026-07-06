using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MonitorSuite.Service.Monitoring;

/// <summary>
/// Escanea todas las ventanas visibles (multi-pantalla) cada 30 s.
/// Solo la ventana con foco acumula tiempo de uso; aquí se listan las abiertas.
/// </summary>
internal sealed class VisibleWindowScanner(
    ILogger<VisibleWindowScanner> logger,
    IMonitoringSessionAccessor sessionAccessor,
    IForegroundWindowTracker foregroundTracker,
    LatestVisibleWindowsStore visibleWindowsStore) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ScanAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogDebug(ex, "Visible window scan failed.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ScanAsync(CancellationToken cancellationToken)
    {
        var sessionId = sessionAccessor.CurrentSessionId;
        if (sessionId is null)
        {
            return;
        }

        var foreground = await foregroundTracker.CaptureActiveWindowAsync(cancellationToken);
        var foregroundKey = foreground is null
            ? string.Empty
            : $"{foreground.ProcessName}|{foreground.DisplayName}";

        var windows = EnumerateVisibleWindows();
        if (windows.Count == 0)
        {
            return;
        }

        var capturedAt = DateTimeOffset.UtcNow;
        var entries = windows
            .Select(w =>
            {
                var key = $"{w.ProcessName}|{w.Title}";
                return new VisibleWindowInfo(w.ProcessName, w.Title, key == foregroundKey);
            })
            .ToList();

        visibleWindowsStore.Set(sessionId.Value, capturedAt, entries);
        logger.LogDebug("Captured {Count} visible windows (memoria).", entries.Count);
    }

    private static List<(string ProcessName, string Title)> EnumerateVisibleWindows()
    {
        var results = new List<(string, string)>();
        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd))
            {
                return true;
            }

            var length = GetWindowTextLength(hWnd);
            if (length == 0)
            {
                return true;
            }

            var titleBuilder = new StringBuilder(length + 1);
            _ = GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
            var title = titleBuilder.ToString().Trim();
            if (string.IsNullOrWhiteSpace(title))
            {
                return true;
            }

            if (!GetWindowThreadProcessId(hWnd, out var processId))
            {
                return true;
            }

            try
            {
                var process = Process.GetProcessById((int)processId);
                results.Add((process.ProcessName, title));
            }
            catch
            {
                // proceso terminado
            }

            return true;
        }, IntPtr.Zero);

        return results
            .DistinctBy(x => $"{x.Item1}|{x.Item2}", StringComparer.OrdinalIgnoreCase)
            .Take(80)
            .ToList();
    }

    #region Win32

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    #endregion
}
