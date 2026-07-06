namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Aggregated window-focus information for an application within a session.
/// </summary>
public sealed class ApplicationUsageSlice
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid SessionId { get; set; }

    public string ProcessName { get; init; } = string.Empty;

    public string DisplayName { get; init; } = string.Empty;

    public string ExecutablePath { get; init; } = string.Empty;

    public DateTimeOffset Start { get; init; }

    public DateTimeOffset End { get; set; }

    public TimeSpan ActiveDuration => End - Start;

    public bool HadUserInput { get; set; }
}


