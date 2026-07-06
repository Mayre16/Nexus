namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Describe the lifecycle state for a monitored Windows session.
/// </summary>
public enum SessionStatus
{
    Unknown = 0,
    Active = 1,
    Locked = 2,
    Disconnected = 3,
    Ended = 4
}


