using System.Text.Json;

namespace MonitorSuite.Shared.Config;

/// <summary>
/// Lectura/escritura del perfil de máquina (JSON en ProgramData).
/// </summary>
public static class MachineProfileStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static string ConfigDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MonitorSuite", "Config");

    public static string FilePath => Path.Combine(ConfigDirectory, "machine_profile.json");

    public static MachineProfile Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var json = File.ReadAllText(FilePath);
                var profile = JsonSerializer.Deserialize<MachineProfile>(json, JsonOptions);
                if (profile is not null)
                {
                    profile.MachineName = Environment.MachineName;
                    profile.WindowsUser = Environment.UserName;
                    return profile;
                }
            }
        }
        catch
        {
            /* usar perfil por defecto */
        }

        return new MachineProfile
        {
            MachineName = Environment.MachineName,
            WindowsUser = Environment.UserName,
            DisplayName = string.Empty,
        };
    }

    public static void Save(MachineProfile profile)
    {
        Directory.CreateDirectory(ConfigDirectory);
        profile.MachineName = Environment.MachineName;
        profile.WindowsUser = Environment.UserName;
        var json = JsonSerializer.Serialize(profile, JsonOptions);
        File.WriteAllText(FilePath, json);
    }

    /// <summary>Nombre para mostrar: DisplayName si existe, si no el usuario Windows.</summary>
    public static string ResolveDisplayName()
    {
        var profile = Load();
        return string.IsNullOrWhiteSpace(profile.DisplayName)
            ? profile.WindowsUser
            : profile.DisplayName.Trim();
    }
}
