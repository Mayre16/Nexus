using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

public interface ISessionStateMonitor
{
    event EventHandler<SessionStatus>? StatusChanged;

    SessionStatus GetCurrentStatus();

    void Start();

    void Stop();
}


