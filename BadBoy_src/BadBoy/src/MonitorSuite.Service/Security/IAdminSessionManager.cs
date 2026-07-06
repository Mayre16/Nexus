namespace MonitorSuite.Service.Security;

public interface IAdminSessionManager
{
    Task<string> IssueAsync(string username, CancellationToken cancellationToken);

    bool Validate(string token);

    void Revoke(string token);
}


