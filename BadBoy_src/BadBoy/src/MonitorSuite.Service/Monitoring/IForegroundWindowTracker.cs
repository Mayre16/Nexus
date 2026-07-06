using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

public interface IForegroundWindowTracker
{
    Task<ApplicationUsageSlice?> CaptureActiveWindowAsync(CancellationToken cancellationToken);
}


