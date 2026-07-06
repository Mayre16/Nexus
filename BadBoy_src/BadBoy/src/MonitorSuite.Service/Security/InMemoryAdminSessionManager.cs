using System.Collections.Concurrent;

namespace MonitorSuite.Service.Security;

internal sealed class InMemoryAdminSessionManager : IAdminSessionManager
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _sessions = new();
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);

    public Task<string> IssueAsync(string username, CancellationToken cancellationToken)
    {
        var token = Convert.ToBase64String(Guid.NewGuid().ToByteArray());
        var expiry = DateTimeOffset.UtcNow.Add(SessionLifetime);
        _sessions[token] = expiry;
        return Task.FromResult(token);
    }

    public bool Validate(string token)
    {
        if (!_sessions.TryGetValue(token, out var expiry))
        {
            return false;
        }

        if (DateTimeOffset.UtcNow > expiry)
        {
            _sessions.TryRemove(token, out _);
            return false;
        }

        return true;
    }

    public void Revoke(string token)
    {
        _sessions.TryRemove(token, out _);
    }
}


