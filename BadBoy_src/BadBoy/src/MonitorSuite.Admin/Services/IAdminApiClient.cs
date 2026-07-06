using System.Threading;
using System.Threading.Tasks;
using MonitorSuite.Shared.Contracts;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Admin.Services;

public interface IAdminApiClient
{
    Task<AdminLoginResponse> LoginAsync(AdminLoginRequest request, CancellationToken cancellationToken);

    Task<AdminLoginResponse> LoginMicrosoftAsync(string accessToken, CancellationToken cancellationToken);

    Task LogoutAsync(string sessionToken, CancellationToken cancellationToken);

    Task<UsageReportResponse> GetUsageReportAsync(UsageReportRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<UsageSliceAggregate>> GetApplicationBreakdownAsync(UsageReportRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<ApplicationActivityDetail>> GetApplicationDetailsAsync(UsageReportRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<BrowserVisitDetail>> GetUrlDetailsAsync(UsageReportRequest request, CancellationToken cancellationToken);

    Task<DashboardDataBundle> GetDashboardDataAsync(UsageReportRequest request, CancellationToken cancellationToken);

    Task<LiveSessionStateResponse?> GetLiveStateAsync(LiveSessionStateRequest request, CancellationToken cancellationToken);

    Task<AgentRuntimeStatus?> GetAgentStatusAsync(CancellationToken cancellationToken);
}


