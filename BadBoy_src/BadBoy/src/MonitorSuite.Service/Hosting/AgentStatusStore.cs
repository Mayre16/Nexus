namespace MonitorSuite.Service.Hosting;

internal sealed class AgentStatusStore
{
    private readonly object _sync = new();
    public DateTimeOffset AgentStartedUtc { get; } = DateTimeOffset.UtcNow;

    public bool NexusEnabled { get; private set; }
    public bool LastNexusSyncOk { get; private set; }
    public DateTimeOffset? LastNexusSyncUtc { get; private set; }
    public string? LastNexusMessage { get; private set; }

    public void SetNexusConfig(bool enabled)
    {
        lock (_sync)
        {
            NexusEnabled = enabled;
        }
    }

    public void RecordNexusSync(bool ok, string message)
    {
        lock (_sync)
        {
            LastNexusSyncOk = ok;
            LastNexusSyncUtc = DateTimeOffset.UtcNow;
            LastNexusMessage = message;
        }
    }

    public (bool NexusEnabled, bool LastOk, DateTimeOffset? LastUtc, string? Message) Snapshot()
    {
        lock (_sync)
        {
            return (NexusEnabled, LastNexusSyncOk, LastNexusSyncUtc, LastNexusMessage);
        }
    }
}
