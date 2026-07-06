using MonitorSuite.Shared.Contracts;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Shared.Contracts;

public sealed record DashboardDataBundle(
    UsageReportResponse Report,
    IReadOnlyList<UsageSliceAggregate> Applications,
    IReadOnlyList<ApplicationActivityDetail> ApplicationDetails,
    IReadOnlyList<BrowserVisitDetail> UrlDetails,
    IReadOnlyList<DailyUsagePoint> DailyBreakdown);
