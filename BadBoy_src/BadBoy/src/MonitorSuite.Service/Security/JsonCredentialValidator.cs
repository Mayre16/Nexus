using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace MonitorSuite.Service.Security;

internal sealed record StoredCredential(string Username, string Salt, string Hash, int Iterations, string? OtpSecret);

internal sealed class JsonCredentialValidator(ILogger<JsonCredentialValidator> logger) : ICredentialValidator
{
    private static readonly string CredentialPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MonitorSuite",
        "Config",
        "admin_credentials.json");

    private readonly SemaphoreSlim _sync = new(1, 1);

    public async Task EnsureSeedAsync(CancellationToken cancellationToken)
    {
        if (File.Exists(CredentialPath))
        {
            return;
        }

        var defaultPassword = "ChangeMe!2025";
        logger.LogWarning("Seeding default administrator credential. Please change immediately via admin console.");
        await SetCredentialAsync("admin", defaultPassword, null, cancellationToken);
    }

    public async Task<bool> ValidateAsync(string username, string password, string? otp, CancellationToken cancellationToken)
    {
        await _sync.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(CredentialPath))
            {
                logger.LogError("Credential file not found.");
                return false;
            }

            var json = await File.ReadAllTextAsync(CredentialPath, cancellationToken);
            var credential = JsonSerializer.Deserialize<StoredCredential>(json);
            if (credential is null || !string.Equals(username, credential.Username, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!VerifyPassword(password, credential))
            {
                return false;
            }

            // OTP solo obligatorio si hay secreto TOTP configurado en admin_credentials.json.
            if (string.IsNullOrWhiteSpace(credential.OtpSecret))
            {
                return true;
            }

            if (string.IsNullOrWhiteSpace(otp))
            {
                logger.LogWarning("Login rechazado: OTP requerido para este administrador.");
                return false;
            }

            // TODO: validar TOTP real cuando se configure producción.
            return true;
        }
        finally
        {
            _sync.Release();
        }
    }

    public async Task SetCredentialAsync(string username, string password, string? otpSecret, CancellationToken cancellationToken)
    {
        var iterations = 200_000;
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = HashPassword(password, salt, iterations);

        var stored = new StoredCredential(username, Convert.ToBase64String(salt), Convert.ToBase64String(hash), iterations, otpSecret);

        Directory.CreateDirectory(Path.GetDirectoryName(CredentialPath)!);

        await _sync.WaitAsync(cancellationToken);
        try
        {
            var json = JsonSerializer.Serialize(stored, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(CredentialPath, json, cancellationToken);
        }
        finally
        {
            _sync.Release();
        }
    }

    private static bool VerifyPassword(string password, StoredCredential credential)
    {
        var salt = Convert.FromBase64String(credential.Salt);
        var expectedHash = Convert.FromBase64String(credential.Hash);
        var computed = HashPassword(password, salt, credential.Iterations);
        return CryptographicOperations.FixedTimeEquals(computed, expectedHash);
    }

    private static byte[] HashPassword(string password, byte[] salt, int iterations)
    {
        using var deriveBytes = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA512);
        return deriveBytes.GetBytes(64);
    }
}


