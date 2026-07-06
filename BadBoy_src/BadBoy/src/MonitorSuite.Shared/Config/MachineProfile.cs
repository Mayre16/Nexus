namespace MonitorSuite.Shared.Config;

/// <summary>
/// Perfil del empleado en ESTE equipo. Permite asignar un nombre legible
/// distinto al usuario Windows (ej. "Martha Valenzuela" en lugar de "marth").
/// Archivo: %PROGRAMDATA%\MonitorSuite\Config\machine_profile.json
/// </summary>
public sealed class MachineProfile
{
    public string MachineName { get; set; } = Environment.MachineName;

    public string WindowsUser { get; set; } = Environment.UserName;

    /// <summary>Nombre mostrado en reportes, gráficos y Nexus Tracker.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Correo corporativo (opcional, enlace con Nexus).</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Division: energia | deportes | ambas</summary>
    public string Division { get; set; } = "energia";
}
