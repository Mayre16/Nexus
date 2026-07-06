namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Ventana visible en pantalla (incluye multi-monitor), aunque no tenga foco.
/// </summary>
public sealed class VisibleWindowSnapshot
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid SessionId { get; init; }

    public string ProcessName { get; init; } = string.Empty;

    public string WindowTitle { get; init; } = string.Empty;

    public bool IsForeground { get; init; }

    public DateTimeOffset CapturedAt { get; init; }
}
