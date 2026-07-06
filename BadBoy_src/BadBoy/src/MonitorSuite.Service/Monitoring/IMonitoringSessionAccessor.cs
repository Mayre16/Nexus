namespace MonitorSuite.Service.Monitoring;

internal interface IMonitoringSessionAccessor
{
    Guid? CurrentSessionId { get; }

    void SetSession(Guid sessionId);

    void ClearSession();
}
