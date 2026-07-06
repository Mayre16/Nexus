namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Tracks privileged operations executed by administrators.
/// </summary>
public sealed class AdminAuditEntry
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string Actor { get; init; } = string.Empty;

    public string Operation { get; init; } = string.Empty;

    public DateTimeOffset OccurredAt { get; init; }

    public string? Metadata { get; init; }
}


