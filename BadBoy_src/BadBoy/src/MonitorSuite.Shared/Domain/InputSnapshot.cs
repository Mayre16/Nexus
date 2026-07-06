namespace MonitorSuite.Shared.Domain;

/// <summary>
/// Stores periodic samples of keyboard/mouse activity state.
/// </summary>
public sealed class InputSnapshot
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid SessionId { get; init; }

    public DateTimeOffset CapturedAt { get; init; }

    public bool HadKeyboardActivity { get; init; }

    public bool HadMouseActivity { get; init; }

    public TimeSpan IdleDuration { get; init; }
}


