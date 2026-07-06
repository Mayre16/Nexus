using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MonitorSuite.Admin.Services;
using MonitorSuite.Admin.ViewModels;
using MonitorSuite.Admin.Views;

namespace MonitorSuite.Admin;

public partial class App : Application
{
    private const string MutexName = "Global\\ADESA.MonitorSuite.Admin";
    private Mutex? _singleInstanceMutex;
    private IHost? _host;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public IServiceProvider Services => _host?.Services ?? throw new InvalidOperationException("Host not built.");

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _singleInstanceMutex = new Mutex(true, MutexName, out var isFirst);
        if (!isFirst)
        {
            ActivateExistingWindow();
            Shutdown();
            return;
        }

        _host = Host.CreateDefaultBuilder(e.Args)
            .ConfigureServices(services =>
            {
                services.AddSingleton<IAdminApiClient, NamedPipeAdminApiClient>();
                services.AddSingleton<MicrosoftAuthService>();
                services.AddSingleton<SessionContext>();
                services.AddTransient<LoginViewModel>();
                services.AddTransient<DashboardViewModel>();
                services.AddTransient<LoginWindow>();
                services.AddTransient<MainWindow>();
            })
            .Build();

        _host.Start();

        var loginWindow = Services.GetRequiredService<LoginWindow>();
        loginWindow.Show();
    }

    private static void ActivateExistingWindow()
    {
        var current = Process.GetCurrentProcess();
        foreach (var process in Process.GetProcessesByName("MonitorSuite.Admin"))
        {
            if (process.Id == current.Id)
            {
                continue;
            }

            var handle = process.MainWindowHandle;
            if (handle == IntPtr.Zero)
            {
                continue;
            }

            ShowWindow(handle, 9);
            SetForegroundWindow(handle);
            return;
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();

        if (_host is not null)
        {
            await _host.StopAsync();
            _host.Dispose();
        }

        base.OnExit(e);
    }
}
