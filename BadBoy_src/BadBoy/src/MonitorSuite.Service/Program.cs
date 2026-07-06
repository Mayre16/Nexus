using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.EventLog;
using MonitorSuite.Service.Hosting;
using MonitorSuite.Service.Monitoring;
using MonitorSuite.Service.Persistence;
using MonitorSuite.Service.Security;
using MonitorSuite.Shared.Data;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "MonitorSuite Service";
});

builder.Logging.AddEventLog(new EventLogSettings
{
    SourceName = "MonitorSuite",
    LogName = "Application"
});

var dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MonitorSuite", "Data");
Directory.CreateDirectory(dataDirectory);

builder.Services.AddSingleton<IEncryptionKeyProvider, DpapiEncryptionKeyProvider>();
builder.Services.AddSingleton<IDatabaseBootstrapper, DatabaseBootstrapper>();
builder.Services.AddSingleton<ICredentialValidator, JsonCredentialValidator>();
builder.Services.AddSingleton<IAdminSessionManager, InMemoryAdminSessionManager>();

builder.Services.AddDbContextFactory<MonitorDbContext>((sp, options) =>
{
    var keyProvider = sp.GetRequiredService<IEncryptionKeyProvider>();
    var connectionString = SqliteConnectionFactory.Create(dataDirectory, keyProvider);

    options.UseSqlite(connectionString);
    options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
});

builder.Services.AddHostedService<MonitorWorker>();

builder.Services.AddSingleton<IForegroundWindowTracker, ForegroundWindowTracker>();
builder.Services.AddSingleton<IInputActivityMonitor, InputActivityMonitor>();
builder.Services.AddSingleton<ISessionStateMonitor, SessionStateMonitor>();
builder.Services.AddSingleton<IBrowserActivitySink, BrowserActivitySink>();
builder.Services.AddSingleton<IMonitoringSessionAccessor, MonitoringSessionAccessor>();
builder.Services.AddSingleton<LatestVisibleWindowsStore>();
builder.Services.AddSingleton<BrowserForegroundTracker>();
builder.Services.AddSingleton<MicrosoftGraphValidator>();
builder.Services.AddSingleton<PipeQueryGate>();
builder.Services.AddSingleton<AgentStatusStore>();
builder.Services.AddSingleton<NamedPipeServerHost>();

builder.Services.AddHostedService<MaintenanceWorker>();
builder.Services.AddHostedService<NamedPipeServerHostedService>();
builder.Services.AddHostedService<BrowserBridgeHostedService>();
builder.Services.AddHostedService<VisibleWindowScanner>();
builder.Services.AddHostedService<CredentialBootstrapHostedService>();
builder.Services.AddHostedService<MonitorSuite.Service.Sync.NexusSyncWorker>();

var host = builder.Build();

await host.RunAsync();


