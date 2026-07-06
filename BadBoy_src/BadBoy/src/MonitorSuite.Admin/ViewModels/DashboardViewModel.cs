using System.Collections.ObjectModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MonitorSuite.Admin.Services;
using MonitorSuite.Shared.Config;
using MonitorSuite.Shared.Contracts;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Admin.ViewModels;

public sealed partial class DashboardViewModel : ObservableObject
{
    private readonly IAdminApiClient _apiClient;
    private readonly SessionContext _sessionContext;

    public DashboardViewModel(IAdminApiClient apiClient, SessionContext sessionContext)
    {
        _apiClient = apiClient;
        _sessionContext = sessionContext;

        FromDate = DateTime.Today.AddDays(-7);
        ToDate = DateTime.Today;

        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        RefreshLiveStateCommand = new AsyncRelayCommand(RefreshLiveStateAsync);
        RefreshAgentStatusCommand = new AsyncRelayCommand(RefreshAgentStatusAsync);
        LogoutCommand = new AsyncRelayCommand(LogoutAsync);
        ExitCommand = new RelayCommand(() => Application.Current.Shutdown());
        ShowPolicyCommand = new RelayCommand(ShowPolicy);
        ExportReportCommand = new AsyncRelayCommand(ExportReportAsync);
        OpenProfileCommand = new RelayCommand(OpenProfile);
        SetPeriodTodayCommand = new RelayCommand(() => ApplyPeriod(0));
        SetPeriodWeekCommand = new RelayCommand(() => ApplyPeriod(7));
        SetPeriodMonthCommand = new RelayCommand(() => ApplyPeriod(30));

        // Cargar perfil local al iniciar.
        var profile = MachineProfileStore.Load();
        if (!string.IsNullOrWhiteSpace(profile.DisplayName))
        {
            HeaderTitle = $"MonitorSuite · {profile.DisplayName}";
        }
    }

    public ObservableCollection<UsageSliceAggregate> ApplicationDetails { get; } = new();

    public ObservableCollection<ApplicationActivityDetail> ApplicationSessions { get; } = new();

    public ObservableCollection<BrowserVisitDetail> UrlVisits { get; } = new();

    public event EventHandler<IReadOnlyList<(string label, double value)>>? PlotRequested;

    public event EventHandler<IReadOnlyList<(string label, double hours)>>? BarPlotRequested;

    public event EventHandler<IReadOnlyList<DailyUsagePoint>>? DailyPlotRequested;

    public event EventHandler? LogoutRequested;

    [ObservableProperty]
    private DateTime _fromDate;

    [ObservableProperty]
    private DateTime _toDate;

    [ObservableProperty]
    private string _liveStateDisplay = "Sin datos.";

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private string? _statusMessage;

    [ObservableProperty]
    private string _headerTitle = "MonitorSuite · ADESA";

    [ObservableProperty]
    private string _selectedPeriodLabel = "Últimos 7 días";

    [ObservableProperty]
    private string _agentBannerText = "Agente: comprobando…";

    public IRelayCommand SetPeriodTodayCommand { get; }

    public IRelayCommand SetPeriodWeekCommand { get; }

    public IRelayCommand SetPeriodMonthCommand { get; }

    private void ApplyPeriod(int daysBack)
    {
        ToDate = DateTime.Today;
        FromDate = daysBack == 0 ? DateTime.Today : DateTime.Today.AddDays(-daysBack);
        SelectedPeriodLabel = daysBack switch
        {
            0 => "Hoy",
            7 => "Últimos 7 días",
            30 => "Últimos 30 días",
            _ => $"{FromDate:dd/MM} – {ToDate:dd/MM}"
        };

        if (RefreshCommand.CanExecute(null))
        {
            _ = RefreshCommand.ExecuteAsync(null);
        }
    }

    public string MachineInfo =>
        $"{MachineProfileStore.ResolveDisplayName()} · {Environment.MachineName} ({Environment.UserName})";

    public IAsyncRelayCommand RefreshCommand { get; }

    public IAsyncRelayCommand RefreshLiveStateCommand { get; }

    public IAsyncRelayCommand RefreshAgentStatusCommand { get; }

    public IAsyncRelayCommand LogoutCommand { get; }

    public IRelayCommand ExitCommand { get; }

    public IRelayCommand ShowPolicyCommand { get; }

    public IAsyncRelayCommand ExportReportCommand { get; }

    public IRelayCommand OpenProfileCommand { get; }

    public void ReloadProfileHeader()
    {
        var profile = MachineProfileStore.Load();
        HeaderTitle = string.IsNullOrWhiteSpace(profile.DisplayName)
            ? "MonitorSuite · ADESA"
            : $"MonitorSuite · {profile.DisplayName}";
        OnPropertyChanged(nameof(MachineInfo));
    }

    private void OpenProfile()
    {
        var window = new Views.MachineProfileWindow();
        window.Owner = Application.Current.Windows.OfType<Views.MainWindow>().FirstOrDefault();
        if (window.ShowDialog() == true)
        {
            ReloadProfileHeader();
        }
    }

    private async Task RefreshAsync()
    {
        if (string.IsNullOrWhiteSpace(_sessionContext.SessionToken))
        {
            StatusMessage = "Sesión inválida.";
            return;
        }

        IsBusy = true;
        StatusMessage = "Actualizando...";
        try
        {
            var request = new UsageReportRequest(
                _sessionContext.SessionToken!,
                Environment.MachineName,
                null,
                DateOnly.FromDateTime(FromDate),
                DateOnly.FromDateTime(ToDate));

            var bundle = await _apiClient.GetDashboardDataAsync(request, CancellationToken.None);

            ApplicationDetails.Clear();
            foreach (var app in bundle.Applications.OrderByDescending(x => x.ActiveTime))
            {
                ApplicationDetails.Add(app);
            }

            ApplicationSessions.Clear();
            foreach (var session in bundle.ApplicationDetails.Take(100))
            {
                ApplicationSessions.Add(session);
            }

            UrlVisits.Clear();
            foreach (var visit in bundle.UrlDetails.Take(100))
            {
                UrlVisits.Add(visit);
            }

            PlotRequested?.Invoke(this, bundle.Applications.Select(x => (x.Application, x.ActiveTime.TotalHours)).ToList());
            BarPlotRequested?.Invoke(this, bundle.Applications
                .OrderByDescending(x => x.ActiveTime)
                .Take(12)
                .Select(x => (x.Application, x.ActiveTime.TotalHours))
                .ToList());
            DailyPlotRequested?.Invoke(this, bundle.DailyBreakdown.ToList());
            StatusMessage = $"Actualización completada · {ApplicationSessions.Count} ventanas · {UrlVisits.Count} URLs · {SelectedPeriodLabel}.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error al actualizar: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task RefreshAgentStatusAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(6));
            var status = await _apiClient.GetAgentStatusAsync(cts.Token);
            if (status is null)
            {
                AgentBannerText = "Agente: sin respuesta";
                return;
            }

            var nexus = status.NexusEnabled
                ? status.LastNexusSyncOk
                    ? $"Nexus OK ({status.LastNexusSyncUtc?.LocalDateTime:HH:mm})"
                    : "Nexus con error"
                : "Nexus off";

            AgentBannerText =
                $"Agente activo · {nexus} · sesión {(status.HasActiveSession ? "activa" : "pendiente")}";
        }
        catch (Exception ex)
        {
            AgentBannerText = $"Agente: {ex.Message}";
        }
    }

    public void StartBackgroundMonitoring()
    {
        _ = RefreshAgentStatusAsync();
        _ = RefreshLiveStateAsync();
    }

    private async Task RefreshLiveStateAsync()
    {
        if (string.IsNullOrWhiteSpace(_sessionContext.SessionToken))
        {
            LiveStateDisplay = "Sesión inválida.";
            return;
        }

        try
        {
            var response = await _apiClient.GetLiveStateAsync(new LiveSessionStateRequest(_sessionContext.SessionToken), CancellationToken.None);
            if (response is null)
            {
                LiveStateDisplay = "Sin actividad registrada.";
                return;
            }

            LiveStateDisplay = $"Equipo: {response.MachineName}\n" +
                               $"Empleado: {response.DisplayName ?? response.UserPrincipalName}\n" +
                               $"Usuario Windows: {response.UserPrincipalName}\n" +
                               $"Estado: {response.Status}\n" +
                               $"Inicio: {response.SessionStart.LocalDateTime}\n" +
                               $"Activo por: {response.ActiveFor}\n" +
                               $"Aplicación con foco: {response.CurrentApplication ?? "N/A"}\n" +
                               $"URL / pestaña: {response.CurrentBrowserUrl ?? "N/A"}\n" +
                               $"Inactividad: {response.IdleFor}\n" +
                               (response.OpenWindows is { Count: > 0 }
                                   ? "\nVentanas abiertas (todas las pantallas):\n" +
                                     string.Join("\n", response.OpenWindows)
                                   : "\n(Sin escaneo de ventanas aún — espere ~30 s)");
        }
        catch (Exception ex)
        {
            LiveStateDisplay = $"Error: {ex.Message}";
        }
    }

    private async Task LogoutAsync()
    {
        if (string.IsNullOrWhiteSpace(_sessionContext.SessionToken))
        {
            LogoutRequested?.Invoke(this, EventArgs.Empty);
            return;
        }

        try
        {
            await _apiClient.LogoutAsync(_sessionContext.SessionToken!, CancellationToken.None);
        }
        finally
        {
            _sessionContext.SessionToken = null;
            LogoutRequested?.Invoke(this, EventArgs.Empty);
        }
    }

    private void ShowPolicy()
    {
        var sb = new StringBuilder();
        sb.AppendLine("Este panel muestra la actividad registrada en los equipos corporativos.");
        sb.AppendLine("Los datos se conservan durante 60 días con fines operativos y de seguridad.");
        sb.AppendLine("Comunicar a los colaboradores la política de monitoreo vigente.");

        MessageBox.Show(sb.ToString(), "Política de monitoreo", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private Task ExportReportAsync()
    {
        // TODO: Integrar generación de PDF usando QuestPDF u otra librería gratuita compatible.
        MessageBox.Show("Función de exportar pendiente de implementación.", "Exportar", MessageBoxButton.OK, MessageBoxImage.Information);
        return Task.CompletedTask;
    }
}


