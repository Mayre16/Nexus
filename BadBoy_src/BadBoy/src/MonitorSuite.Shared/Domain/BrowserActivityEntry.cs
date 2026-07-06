namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Details an individual navigation event for supported browsers.
/// </summary>
public sealed class BrowserActivityEntry
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid SessionId { get; init; }

    public string Browser { get; init; } = string.Empty;

    public string Url { get; init; } = string.Empty;

    public string Title { get; init; } = string.Empty;

    public DateTimeOffset Timestamp { get; init; }

    public TimeSpan? Duration { get; set; }
}


