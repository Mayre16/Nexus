namespace MonitorSuite.Service.Monitoring;

internal sealed class MonitoringSessionAccessor : IMonitoringSessionAccessor
{
    private Guid? _sessionId;

    public Guid? CurrentSessionId => _sessionId;

    public void SetSession(Guid sessionId) => _sessionId = sessionId;

    public void ClearSession() => _sessionId = null;
}
