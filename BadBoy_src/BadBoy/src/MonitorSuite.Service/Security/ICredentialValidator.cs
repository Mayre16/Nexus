namespace MonitorSuite.Service.Security;

public interface ICredentialValidator
{
    Task<bool> ValidateAsync(string username, string password, string? otp, CancellationToken cancellationToken);

    Task EnsureSeedAsync(CancellationToken cancellationToken);
}


