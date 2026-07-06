using System.Runtime.InteropServices;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

internal sealed class InputActivityMonitor : IInputActivityMonitor
{
    public InputSnapshot CaptureSnapshot(Guid sessionId)
    {
        var tickCount = Environment.TickCount64;
        var lastInputTicks = GetLastInputTime();
        var idleTicks = tickCount - lastInputTicks;
        var idleDuration = TimeSpan.FromMilliseconds(idleTicks);

        return new InputSnapshot
        {
            SessionId = sessionId,
            CapturedAt = DateTimeOffset.UtcNow,
            HadKeyboardActivity = idleDuration < TimeSpan.FromSeconds(5),
            HadMouseActivity = idleDuration < TimeSpan.FromSeconds(5),
            IdleDuration = idleDuration
        };
    }

    private static long GetLastInputTime()
    {
        var lastInputInfo = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref lastInputInfo))
        {
            return Environment.TickCount64;
        }

        return lastInputInfo.dwTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}


