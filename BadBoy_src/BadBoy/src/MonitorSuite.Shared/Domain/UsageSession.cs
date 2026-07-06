namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Represents a contiguous Windows logon session being monitored.
/// </summary>
public sealed class UsageSession
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string MachineName { get; init; } = Environment.MachineName;

    public string UserPrincipalName { get; init; } = string.Empty;

    public DateTimeOffset SessionStart { get; init; }

    public DateTimeOffset? SessionEnd { get; set; }

    public SessionStatus Status { get; set; } = SessionStatus.Active;

    public List<ApplicationUsageSlice> ApplicationSlices { get; init; } = new();

    public List<BrowserActivityEntry> BrowserEntries { get; init; } = new();

    public List<InputSnapshot> InputSnapshots { get; init; } = new();
}


