namespace MonitorSuite.Service.Monitoring;

/// <summary>
/// Cache en memoria de ventanas visibles (evita escribir miles de filas en SQLite).
/// </summary>
internal sealed class LatestVisibleWindowsStore
{
    private readonly object _lock = new();
    private Guid _sessionId;
    private DateTimeOffset _capturedAt;
    private IReadOnlyList<VisibleWindowInfo> _windows = Array.Empty<VisibleWindowInfo>();

    public void Set(Guid sessionId, DateTimeOffset capturedAt, IReadOnlyList<VisibleWindowInfo> windows)
    {
        lock (_lock)
        {
            _sessionId = sessionId;
            _capturedAt = capturedAt;
            _windows = windows;
        }
    }

    public (DateTimeOffset CapturedAt, IReadOnlyList<VisibleWindowInfo> Windows)? Get(Guid sessionId)
    {
        lock (_lock)
        {
            if (_sessionId != sessionId || _windows.Count == 0)
            {
                return null;
            }

            return (_capturedAt, _windows);
        }
    }
}

internal readonly record struct VisibleWindowInfo(
    string ProcessName,
    string WindowTitle,
    bool IsForeground);
