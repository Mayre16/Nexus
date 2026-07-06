using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Config;

namespace MonitorSuite.Service.Security;

internal sealed class MicrosoftGraphValidator(ILogger<MicrosoftGraphValidator> logger)
{
    private static readonly HttpClient Http = new();
    public async Task<(bool Ok, string? Email, string? Error)> ValidateAccessTokenAsync(
        string accessToken,
        CancellationToken cancellationToken)
    {
        var config = AzureAdConfig.Load();
        if (!config.Enabled)
        {
            return (false, null, "Microsoft login no configurado.");
        }

        var client = Http;
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Graph /me failed: {Status}", response.StatusCode);
            return (false, null, "Token Microsoft inválido o expirado.");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var email = doc.RootElement.TryGetProperty("mail", out var mailEl) && mailEl.ValueKind == JsonValueKind.String
            ? mailEl.GetString()
            : doc.RootElement.TryGetProperty("userPrincipalName", out var upnEl)
                ? upnEl.GetString()
                : null;

        if (string.IsNullOrWhiteSpace(email))
        {
            return (false, null, "No se pudo leer el correo de Microsoft.");
        }

        if (!config.IsEmailAllowed(email))
        {
            return (false, email, "Cuenta no autorizada para ver datos de BadBoy.");
        }

        return (true, email, null);
    }
}
