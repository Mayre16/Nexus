using System.Text.RegularExpressions;

namespace MonitorSuite.Service.Monitoring;

internal static partial class BrowserHelper
{
    private static readonly HashSet<string> BrowserProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "iexplore"
    };

    public static bool IsBrowser(string processName) =>
        BrowserProcesses.Contains(processName);

    public static string ResolveBrowserName(string processName) =>
        processName.ToLowerInvariant() switch
        {
            "chrome" => "Chrome",
            "msedge" => "Edge",
            "firefox" => "Firefox",
            "brave" => "Brave",
            "opera" => "Opera",
            "vivaldi" => "Vivaldi",
            "iexplore" => "Internet Explorer",
            _ => processName
        };

    public static string ParsePageTitle(string windowTitle, string processName)
    {
        if (string.IsNullOrWhiteSpace(windowTitle))
        {
            return string.Empty;
        }

        var title = windowTitle.Trim();
        var suffixes = new[]
        {
            " - Google Chrome",
            " - Microsoft​ Edge",
            " - Microsoft Edge",
            " - Mozilla Firefox",
            " - Brave",
            " - Opera",
            " - Vivaldi",
            " - Internet Explorer"
        };

        foreach (var suffix in suffixes)
        {
            if (title.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            {
                return title[..^suffix.Length].Trim();
            }
        }

        return title;
    }

    public static bool TryExtractUrl(string text, out string url)
    {
        url = string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var match = UrlRegex().Match(text);
        if (!match.Success)
        {
            return false;
        }

        url = match.Value.TrimEnd('/', '.', ',', ';');
        return true;
    }

    [GeneratedRegex(@"https?://[^\s<>""']+", RegexOptions.IgnoreCase)]
    private static partial Regex UrlRegex();
}
