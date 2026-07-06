using System.IO;

using System.IO.Pipes;

using System.Text;

using System.Text.Json;

using System.Threading;

using System.Threading.Tasks;

using MonitorSuite.Shared.Contracts;

using MonitorSuite.Shared.Domain;



namespace MonitorSuite.Admin.Services;



public sealed class NamedPipeAdminApiClient : IAdminApiClient

{

    private const string PipeName = "MonitorSuitePipe";

    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(5);

    private static readonly TimeSpan IoTimeout = TimeSpan.FromSeconds(10);



    public Task<AdminLoginResponse> LoginAsync(AdminLoginRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(() => LoginCoreAsync(request, cancellationToken));



    public Task<AdminLoginResponse> LoginMicrosoftAsync(string accessToken, CancellationToken cancellationToken) =>

        RunOffUiAsync(() => LoginMicrosoftCoreAsync(accessToken, cancellationToken));



    public Task LogoutAsync(string sessionToken, CancellationToken cancellationToken) =>

        RunOffUiAsync(() => SendAsync("logout", new AdminLogoutRequest(sessionToken), cancellationToken));



    public Task<UsageReportResponse> GetUsageReportAsync(UsageReportRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var response = await SendAsync("usageReport", request, cancellationToken);

            return response.GetProperty("payload").Deserialize<UsageReportResponse>()

                ?? new UsageReportResponse(Array.Empty<DailyUsageSummary>(), TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero);

        });



    public Task<IReadOnlyList<UsageSliceAggregate>> GetApplicationBreakdownAsync(UsageReportRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var bundle = await GetDashboardDataCoreAsync(request, cancellationToken);

            return bundle.Applications;

        });



    public Task<IReadOnlyList<ApplicationActivityDetail>> GetApplicationDetailsAsync(UsageReportRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var bundle = await GetDashboardDataCoreAsync(request, cancellationToken);

            return bundle.ApplicationDetails;

        });



    public Task<IReadOnlyList<BrowserVisitDetail>> GetUrlDetailsAsync(UsageReportRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var bundle = await GetDashboardDataCoreAsync(request, cancellationToken);

            return bundle.UrlDetails;

        });



    public Task<DashboardDataBundle> GetDashboardDataAsync(UsageReportRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(() => GetDashboardDataCoreAsync(request, cancellationToken));



    public Task<LiveSessionStateResponse?> GetLiveStateAsync(LiveSessionStateRequest request, CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var response = await SendAsync("liveState", request, cancellationToken);

            return response.GetProperty("payload").Deserialize<LiveSessionStateResponse?>();

        });



    public Task<AgentRuntimeStatus?> GetAgentStatusAsync(CancellationToken cancellationToken) =>

        RunOffUiAsync(async () =>

        {

            var response = await SendAsync("agentStatus", new { }, cancellationToken);

            return response.GetProperty("payload").Deserialize<AgentRuntimeStatus>();

        });



    private static Task<T> RunOffUiAsync<T>(Func<Task<T>> action) => Task.Run(action);



    private static async Task<AdminLoginResponse> LoginCoreAsync(AdminLoginRequest request, CancellationToken cancellationToken)

    {

        var response = await SendAsync("login", request, cancellationToken);

        var payload = response.GetProperty("payload").Deserialize<AdminLoginResponse>();

        return payload ?? new AdminLoginResponse(false, "Respuesta inválida", null);

    }



    private static async Task<AdminLoginResponse> LoginMicrosoftCoreAsync(string accessToken, CancellationToken cancellationToken)

    {

        var response = await SendAsync("microsoftLogin", new AdminMicrosoftLoginRequest(accessToken), cancellationToken);

        var payload = response.GetProperty("payload").Deserialize<AdminLoginResponse>();

        return payload ?? new AdminLoginResponse(false, "Respuesta inválida", null);

    }



    private static async Task<DashboardDataBundle> GetDashboardDataCoreAsync(UsageReportRequest request, CancellationToken cancellationToken)

    {

        var response = await SendAsync("usageReport", request, cancellationToken);

        var report = response.GetProperty("payload").Deserialize<UsageReportResponse>()

            ?? new UsageReportResponse(Array.Empty<DailyUsageSummary>(), TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero);



        IReadOnlyList<UsageSliceAggregate> apps = Array.Empty<UsageSliceAggregate>();

        if (response.TryGetProperty("applications", out var appsEl))

        {

            apps = appsEl.Deserialize<List<UsageSliceAggregate>>() ?? apps;

        }



        IReadOnlyList<ApplicationActivityDetail> appDetails = Array.Empty<ApplicationActivityDetail>();

        if (response.TryGetProperty("applicationDetails", out var appDetailsEl))

        {

            appDetails = appDetailsEl.Deserialize<List<ApplicationActivityDetail>>() ?? appDetails;

        }



        IReadOnlyList<BrowserVisitDetail> urls = Array.Empty<BrowserVisitDetail>();

        if (response.TryGetProperty("urlDetails", out var urlsEl))

        {

            urls = urlsEl.Deserialize<List<BrowserVisitDetail>>() ?? urls;

        }



        IReadOnlyList<DailyUsagePoint> daily = Array.Empty<DailyUsagePoint>();

        if (response.TryGetProperty("dailyBreakdown", out var dailyEl))

        {

            daily = dailyEl.Deserialize<List<DailyUsagePoint>>() ?? daily;

        }



        return new DashboardDataBundle(report, apps, appDetails, urls, daily);

    }



    private static Task<JsonElement> SendAsync(string type, object payload, CancellationToken cancellationToken) =>

        Task.Run(() => SendSync(type, payload, cancellationToken), cancellationToken);



    private static JsonElement SendSync(string type, object payload, CancellationToken cancellationToken)

    {

        cancellationToken.ThrowIfCancellationRequested();



        if (!File.Exists($@"\\.\pipe\{PipeName}"))

        {

            throw new IOException("El agente BadBoy no responde. Ejecute scripts\\restart-badboy.ps1");

        }



        var connectMs = (int)Math.Clamp(ConnectTimeout.TotalMilliseconds, 1, int.MaxValue);

        using var stream = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.None);

        stream.Connect(connectMs);



        using var writer = new StreamWriter(stream, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };

        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);



        var message = JsonSerializer.Serialize(new { type, payload });

        writer.WriteLine(message);



        var ioTask = Task.Run(() => reader.ReadLine(), cancellationToken);

        if (!ioTask.Wait(IoTimeout))

        {

            throw new TimeoutException("Tiempo agotado esperando respuesta del agente BadBoy.");

        }



        cancellationToken.ThrowIfCancellationRequested();

        var responseLine = ioTask.Result;

        if (responseLine is null)

        {

            throw new InvalidOperationException("Empty response from service.");

        }



        using var document = JsonDocument.Parse(responseLine);

        var root = document.RootElement;

        if (root.TryGetProperty("error", out var error))

        {

            throw new InvalidOperationException($"Service error: {error.GetString()}");

        }



        return root.Clone();

    }

}


