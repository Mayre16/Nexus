using System.Text.Json;

namespace MonitorSuite.Shared.Config;

/// <summary>
/// Login Microsoft (MFA vía cuenta corporativa). Archivo: %PROGRAMDATA%\MonitorSuite\Config\azure_ad.json
/// </summary>
public sealed class AzureAdConfig
{
    public bool Enabled { get; set; }

    public string TenantId { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public List<string> AllowedEmails { get; set; } = [];

    public static string ConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MonitorSuite", "Config", "azure_ad.json");

    public static AzureAdConfig Load()
    {
        if (!File.Exists(ConfigPath))
        {
            return new AzureAdConfig();
        }

        var json = File.ReadAllText(ConfigPath);
        return JsonSerializer.Deserialize<AzureAdConfig>(json, JsonOptions) ?? new AzureAdConfig();
    }

    public bool IsEmailAllowed(string email)
    {
        if (AllowedEmails.Count == 0)
        {
            return true;
        }

        return AllowedEmails.Any(e =>
            string.Equals(e, email, StringComparison.OrdinalIgnoreCase));
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };
}
