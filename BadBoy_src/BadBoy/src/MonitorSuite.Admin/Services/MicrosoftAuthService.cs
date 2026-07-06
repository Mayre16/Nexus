using Microsoft.Identity.Client;
using MonitorSuite.Shared.Config;

namespace MonitorSuite.Admin.Services;

public sealed class MicrosoftAuthService
{
    public bool IsConfigured
    {
        get
        {
            var config = AzureAdConfig.Load();
            return config.Enabled &&
                   !string.IsNullOrWhiteSpace(config.ClientId) &&
                   !string.IsNullOrWhiteSpace(config.TenantId);
        }
    }

    public async Task<string?> AcquireTokenInteractiveAsync(CancellationToken cancellationToken = default)
    {
        var config = AzureAdConfig.Load();
        if (!config.Enabled)
        {
            return null;
        }

        var app = PublicClientApplicationBuilder
            .Create(config.ClientId)
            .WithAuthority(AzureCloudInstance.AzurePublic, config.TenantId)
            .WithRedirectUri("http://localhost")
            .Build();

        var accounts = await app.GetAccountsAsync();
        try
        {
            var silent = await app.AcquireTokenSilent(new[] { "User.Read" }, accounts.FirstOrDefault())
                .ExecuteAsync(cancellationToken);
            return silent.AccessToken;
        }
        catch (MsalUiRequiredException)
        {
            var interactive = await app.AcquireTokenInteractive(new[] { "User.Read" })
                .WithUseEmbeddedWebView(false)
                .ExecuteAsync(cancellationToken);
            return interactive.AccessToken;
        }
    }
}
