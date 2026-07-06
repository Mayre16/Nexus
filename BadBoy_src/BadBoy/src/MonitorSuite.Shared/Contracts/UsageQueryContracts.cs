using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Shared.Contracts;

/// <summary>
/// Query parameters for aggregated usage reports.
/// </summary>
public sealed record UsageReportRequest(
    string SessionToken,
    string? MachineName,
    string? UserPrincipalName,
    DateOnly From,
    DateOnly To);

/// <summary>
/// Report returned to the admin console.
/// </summary>
public sealed record UsageReportResponse(
    IReadOnlyList<DailyUsageSummary> DailySummaries,
    TimeSpan TotalActive,
    TimeSpan TotalIdle,
    TimeSpan TotalLocked);

/// <summary>
/// Request for real-time session state.
/// </summary>
public sealed record LiveSessionStateRequest(string SessionToken);

public sealed record LiveSessionStateResponse(
    string MachineName,
    string UserPrincipalName,
    SessionStatus Status,
    DateTimeOffset SessionStart,
    TimeSpan ActiveFor,
    string? CurrentApplication,
    string? CurrentBrowserUrl,
    TimeSpan IdleFor,
    string? DisplayName = null,
    IReadOnlyList<string>? OpenWindows = null);

public sealed record MicrosoftLoginRequest(string AccessToken);

public sealed record DailyUsagePoint(
    DateOnly Date,
    double ActiveHours,
    string TopApplication);


