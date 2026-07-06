namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Pre-computed usage aggregates for reporting.
/// </summary>
public sealed class DailyUsageSummary
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string MachineName { get; init; } = string.Empty;

    public string UserPrincipalName { get; init; } = string.Empty;

    public DateOnly Date { get; init; }

    public TimeSpan ActiveTime { get; init; }

    public TimeSpan IdleTime { get; init; }

    public TimeSpan LockedTime { get; init; }

    public List<UsageSliceAggregate> Applications { get; init; } = new();

    public List<BrowserAggregate> Browsers { get; init; } = new();
}

public sealed class UsageSliceAggregate
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string Application { get; set; } = string.Empty;

    public TimeSpan ActiveTime { get; set; }

    public double Percentage { get; set; }
}

public sealed class BrowserAggregate
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public string Browser { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public TimeSpan ActiveTime { get; set; }

    public double Percentage { get; set; }
}


