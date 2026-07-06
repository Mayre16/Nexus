using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MonitorSuite.Admin.Services;
using MonitorSuite.Shared.Contracts;

namespace MonitorSuite.Admin.ViewModels;

public partial class LoginViewModel : ObservableObject
{
    private readonly IAdminApiClient _apiClient;
    private readonly MicrosoftAuthService _microsoftAuth;
    private readonly SessionContext _sessionContext;

    public LoginViewModel(IAdminApiClient apiClient, MicrosoftAuthService microsoftAuth, SessionContext sessionContext)
    {
        _apiClient = apiClient;
        _microsoftAuth = microsoftAuth;
        _sessionContext = sessionContext;
        LoginCommand = new AsyncRelayCommand(LoginAsync, CanLogin);
        MicrosoftLoginCommand = new AsyncRelayCommand(MicrosoftLoginAsync, CanMicrosoftLogin);
        MicrosoftLoginAvailable = _microsoftAuth.IsConfigured;
    }

    public event EventHandler? LoginSucceeded;

    [ObservableProperty]
    private string _username = "admin";

    [ObservableProperty]
    private string _password = string.Empty;

    [ObservableProperty]
    private string? _errorMessage;

    [ObservableProperty]
    private bool _microsoftLoginAvailable;

    [ObservableProperty]
    private bool _isLoggingIn;

    [ObservableProperty]
    private string _agentStatusText = "Comprobando agente en segundo plano…";

    [ObservableProperty]
    private bool _agentOnline;

    public IAsyncRelayCommand LoginCommand { get; }

    public IAsyncRelayCommand MicrosoftLoginCommand { get; }

    public async Task RefreshAgentStatusAsync()
    {
        if (!File.Exists(@"\\.\pipe\MonitorSuitePipe"))
        {
            AgentOnline = false;
            AgentStatusText = "Agente detenido. Reinicie BadBoy o ejecute el acceso directo tras reiniciar Windows.";
            return;
        }

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(6));
            var status = await _apiClient.GetAgentStatusAsync(cts.Token).ConfigureAwait(true);
            if (status is null)
            {
                AgentOnline = false;
                AgentStatusText = "Agente no respondió. Pulse Ingresar tras reiniciar el agente.";
                return;
            }

            AgentOnline = status.AgentRunning;
            var nexus = status.NexusEnabled
                ? status.LastNexusSyncUtc is null
                    ? "Nexus: configurado, esperando primer envío"
                    : status.LastNexusSyncOk
                        ? $"Nexus: OK · último envío {status.LastNexusSyncUtc.Value.LocalDateTime:HH:mm:ss}"
                        : $"Nexus: error · {status.LastNexusMessage}"
                : "Nexus: desactivado en nexus.json";

            var session = status.HasActiveSession ? "monitoreando esta PC" : "sin sesión activa aún";
            AgentStatusText =
                $"Agente activo · {session} · {nexus} · {status.DisplayName ?? status.MachineName}";
        }
        catch
        {
            AgentOnline = false;
            AgentStatusText = "Agente ocupado o reiniciando. Espere unos segundos e intente Ingresar.";
        }
    }
    public void ResetLoginState()
    {
        IsLoggingIn = false;
        ErrorMessage = null;
        LoginCommand.NotifyCanExecuteChanged();
        MicrosoftLoginCommand.NotifyCanExecuteChanged();
    }

    private bool CanLogin() => !IsLoggingIn && !string.IsNullOrWhiteSpace(Username);

    private bool CanMicrosoftLogin() => !IsLoggingIn && MicrosoftLoginAvailable;

    partial void OnUsernameChanged(string value)
    {
        LoginCommand.NotifyCanExecuteChanged();
        MicrosoftLoginCommand.NotifyCanExecuteChanged();
    }

    partial void OnPasswordChanged(string value) => LoginCommand.NotifyCanExecuteChanged();

    partial void OnIsLoggingInChanged(bool value)
    {
        LoginCommand.NotifyCanExecuteChanged();
        MicrosoftLoginCommand.NotifyCanExecuteChanged();
    }

    private async Task LoginAsync()
    {
        if (string.IsNullOrWhiteSpace(Password))
        {
            ErrorMessage = "Escriba la contraseña (por defecto: ChangeMe!2025).";
            return;
        }

        ErrorMessage = null;
        IsLoggingIn = true;

        using var loginCts = new CancellationTokenSource(TimeSpan.FromSeconds(12));

        try
        {
            var request = new AdminLoginRequest(Username, Password, null);
            var response = await _apiClient.LoginAsync(request, loginCts.Token).ConfigureAwait(true);

            if (!response.Succeeded || string.IsNullOrWhiteSpace(response.SessionToken))
            {
                ErrorMessage = response.FailureReason ?? "Credenciales inválidas";
                return;
            }

            _sessionContext.SessionToken = response.SessionToken;
            _sessionContext.Username = response.Username ?? Username;
            LoginSucceeded?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex) when (IsAgentOffline(ex))
        {
            ErrorMessage = AgentOfflineMessage;
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Error al autenticar: {ex.Message}";
        }
        finally
        {
            IsLoggingIn = false;
        }
    }

    private async Task MicrosoftLoginAsync()
    {
        ErrorMessage = null;
        IsLoggingIn = true;

        using var loginCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));

        try
        {
            var token = await _microsoftAuth.AcquireTokenInteractiveAsync(CancellationToken.None)
                .ConfigureAwait(true);
            if (string.IsNullOrWhiteSpace(token))
            {
                ErrorMessage = "No se obtuvo token de Microsoft.";
                return;
            }

            var response = await _apiClient.LoginMicrosoftAsync(token, loginCts.Token).ConfigureAwait(true);
            if (!response.Succeeded || string.IsNullOrWhiteSpace(response.SessionToken))
            {
                ErrorMessage = response.FailureReason ?? "Cuenta Microsoft no autorizada.";
                return;
            }

            _sessionContext.SessionToken = response.SessionToken;
            _sessionContext.Username = response.Username ?? "Microsoft";
            LoginSucceeded?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex) when (IsAgentOffline(ex))
        {
            ErrorMessage = AgentOfflineMessage;
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Microsoft: {ex.Message}";
        }
        finally
        {
            IsLoggingIn = false;
        }
    }

    private static bool IsAgentOffline(Exception ex) =>
        ex is TimeoutException or IOException or OperationCanceledException ||
        ex.Message.Contains("Tiempo agotado", StringComparison.OrdinalIgnoreCase) ||
        ex.Message.Contains("pipe", StringComparison.OrdinalIgnoreCase) ||
        ex.Message.Contains("connect", StringComparison.OrdinalIgnoreCase) ||
        ex.Message.Contains("no responde", StringComparison.OrdinalIgnoreCase);

    private const string AgentOfflineMessage =
        "El agente BadBoy no responde. Ejecute scripts\\restart-badboy.ps1";
}
