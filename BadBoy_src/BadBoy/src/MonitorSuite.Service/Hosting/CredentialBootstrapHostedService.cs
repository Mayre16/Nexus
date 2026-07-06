using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MonitorSuite.Service.Security;

namespace MonitorSuite.Service.Hosting;

internal sealed class CredentialBootstrapHostedService(
    ILogger<CredentialBootstrapHostedService> logger,
    ICredentialValidator credentialValidator)
    : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await credentialValidator.EnsureSeedAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to ensure administrator credentials are initialized.");
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}


