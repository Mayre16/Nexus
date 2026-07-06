using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

internal sealed class ForegroundWindowTracker(ILogger<ForegroundWindowTracker> logger) : IForegroundWindowTracker
{
    public Task<ApplicationUsageSlice?> CaptureActiveWindowAsync(CancellationToken cancellationToken)
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero)
        {
            return Task.FromResult<ApplicationUsageSlice?>(null);
        }

        if (!GetWindowThreadProcessId(handle, out var processId))
        {
            logger.LogDebug("Unable to retrieve process id for foreground window.");
            return Task.FromResult<ApplicationUsageSlice?>(null);
        }

        try
        {
            var process = Process.GetProcessById((int)processId);
            var processName = process.ProcessName;
            var executable = process.MainModule?.FileName ?? string.Empty;

            var titleBuilder = new StringBuilder(256);
            _ = GetWindowText(handle, titleBuilder, titleBuilder.Capacity);

            var now = DateTimeOffset.UtcNow;

            var slice = new ApplicationUsageSlice
            {
                SessionId = Guid.Empty, // will be overwritten by caller
                ProcessName = processName,
                DisplayName = titleBuilder.ToString(),
                ExecutablePath = executable,
                Start = now,
                End = now
            };

            return Task.FromResult<ApplicationUsageSlice?>(slice);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to inspect foreground process.");
            return Task.FromResult<ApplicationUsageSlice?>(null);
        }
    }

    #region Win32 Interop

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    #endregion
}


