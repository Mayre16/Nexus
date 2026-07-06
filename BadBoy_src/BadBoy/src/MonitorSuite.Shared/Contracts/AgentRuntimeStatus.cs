namespace MonitorSuite.Shared.Contracts;

public sealed record AgentRuntimeStatus(
    bool AgentRunning,
    bool NexusEnabled,
    bool LastNexusSyncOk,
    DateTimeOffset? LastNexusSyncUtc,
    string? LastNexusMessage,
    bool HasActiveSession,
    string? CurrentApplication,
    string? MachineName,
    string? DisplayName);
