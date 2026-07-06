using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

internal sealed class SessionStateMonitor(ILogger<SessionStateMonitor> logger) : ISessionStateMonitor
{
    private SessionStatus _currentStatus = SessionStatus.Active;

    public event EventHandler<SessionStatus>? StatusChanged;

    public SessionStatus GetCurrentStatus() => _currentStatus;

    public void Start()
    {
        SystemEvents.SessionSwitch += OnSessionSwitch;
    }

    public void Stop()
    {
        SystemEvents.SessionSwitch -= OnSessionSwitch;
    }

    private void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        _currentStatus = e.Reason switch
        {
            SessionSwitchReason.SessionLock => SessionStatus.Locked,
            SessionSwitchReason.SessionUnlock => SessionStatus.Active,
            SessionSwitchReason.ConsoleDisconnect => SessionStatus.Disconnected,
            SessionSwitchReason.SessionLogoff => SessionStatus.Ended,
            SessionSwitchReason.SessionLogon => SessionStatus.Active,
            _ => SessionStatus.Unknown
        };

        logger.LogInformation("Session status changed to {Status}", _currentStatus);
        StatusChanged?.Invoke(this, _currentStatus);
    }
}


