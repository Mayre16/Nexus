using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using MonitorSuite.Admin.ViewModels;

namespace MonitorSuite.Admin.Views;

public partial class LoginWindow : Window
{
    private DispatcherTimer? _statusTimer;

    public LoginWindow(LoginViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel vm)
        {
            vm.LoginSucceeded += OnLoginSucceeded;
            vm.ResetLoginState();
            await vm.RefreshAgentStatusAsync();
            _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
            _statusTimer.Tick += async (_, _) => await vm.RefreshAgentStatusAsync();
            _statusTimer.Start();
        }

        PasswordBox.Focus();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        _statusTimer?.Stop();
        if (DataContext is LoginViewModel vm)
        {
            vm.LoginSucceeded -= OnLoginSucceeded;
        }
    }

    private void PasswordBox_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel vm && sender is PasswordBox passwordBox)
        {
            vm.Password = passwordBox.Password;
        }
    }

    private async void PasswordBox_OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || DataContext is not LoginViewModel vm)
        {
            return;
        }

        if (vm.LoginCommand.CanExecute(null))
        {
            await vm.LoginCommand.ExecuteAsync(null);
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OnLoginSucceeded(object? sender, EventArgs e)
    {
        var app = (App)Application.Current;
        var dashboard = app.Services.GetRequiredService<MainWindow>();
        dashboard.Owner = this;
        dashboard.Show();
        Hide();
    }
}
