using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

public interface IInputActivityMonitor
{
    InputSnapshot CaptureSnapshot(Guid sessionId);
}


