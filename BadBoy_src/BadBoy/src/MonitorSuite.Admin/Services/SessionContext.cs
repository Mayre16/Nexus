namespace MonitorSuite.Admin.Services;

public sealed class SessionContext
{
    public string? SessionToken { get; set; }

    public string Username { get; set; } = string.Empty;
}


