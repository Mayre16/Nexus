using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MonitorSuite.Service.Hosting;

internal sealed class NamedPipeServerHostedService(
    ILogger<NamedPipeServerHostedService> logger,
    NamedPipeServerHost host) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Named pipe server starting.");
        await host.RunAsync(stoppingToken);
        logger.LogInformation("Named pipe server stopped.");
    }
}


