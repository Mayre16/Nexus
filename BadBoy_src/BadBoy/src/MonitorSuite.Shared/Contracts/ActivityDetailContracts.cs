namespace MonitorSuite.Shared.Contracts;

/// <summary>
/// Una ventana/aplicación concreta en un momento dado (no agregado global).
/// </summary>
public sealed class ApplicationActivityDetail
{
    public DateTimeOffset Start { get; set; }

    public DateTimeOffset End { get; set; }

    public string ProcessName { get; set; } = string.Empty;

    public string WindowTitle { get; set; } = string.Empty;

    public TimeSpan Duration { get; set; }
}

/// <summary>
/// Una visita URL concreta (pestaña/navegación individual).
/// </summary>
public sealed class BrowserVisitDetail
{
    public DateTimeOffset Timestamp { get; set; }

    public string Browser { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public TimeSpan Duration { get; set; }
}
