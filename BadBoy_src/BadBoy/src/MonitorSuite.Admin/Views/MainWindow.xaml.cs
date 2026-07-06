using System.Linq;
using System.Windows;
using System.Windows.Threading;
using MonitorSuite.Admin.ViewModels;using MonitorSuite.Shared.Contracts;
using ScottPlot;
using ScottPlot.Palettes;
using ScottPlot.Plottables;

namespace MonitorSuite.Admin.Views;

public partial class MainWindow : Window
{
    private DispatcherTimer? _liveTimer;

    public MainWindow(DashboardViewModel viewModel)    {
        InitializeComponent();
        DataContext = viewModel;

        Loaded += (_, _) =>
        {
            viewModel.PlotRequested += OnPlotRequested;
            viewModel.BarPlotRequested += OnBarPlotRequested;
            viewModel.DailyPlotRequested += OnDailyPlotRequested;
            viewModel.LogoutRequested += OnLogoutRequested;
            viewModel.StatusMessage = "Cargando actividad en vivo del agente…";
            viewModel.StartBackgroundMonitoring();

            _liveTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(20) };
            _liveTimer.Tick += async (_, _) =>
            {
                if (viewModel.RefreshLiveStateCommand.CanExecute(null))
                {
                    await viewModel.RefreshLiveStateCommand.ExecuteAsync(null);
                }

                if (viewModel.RefreshAgentStatusCommand.CanExecute(null))
                {
                    await viewModel.RefreshAgentStatusCommand.ExecuteAsync(null);
                }
            };
            _liveTimer.Start();
        };

        Closed += (_, _) => _liveTimer?.Stop();
    }

    private void RenderOnUi(Action draw)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(draw);
            return;
        }

        draw();
    }

    private void OnPlotRequested(object? sender, IReadOnlyList<(string label, double value)> e)
    {
        RenderOnUi(() =>
        {
        UsagePieChart.Plot.Clear();
        if (e.Count == 0)
        {
            UsagePieChart.Refresh();
            return;
        }

        var palette = new Category10();
        var colors = palette.Colors;
        var total = e.Sum(x => x.value);
        var slices = e.Select((item, index) =>
        {
            var color = colors[index % colors.Length];
            var percentage = total > 0 ? item.value / total : 0;
            var label = $"{item.label} ({percentage:P0})";
            return new PieSlice(item.value, color, label);
        }).ToList();

        var pie = UsagePieChart.Plot.Add.Pie(slices);
        pie.ExplodeFraction = 0.05;
        pie.LineStyle.Width = 0;

        UsagePieChart.Plot.Legend.IsVisible = true;

        UsagePieChart.Refresh();
        });
    }

    private void OnBarPlotRequested(object? sender, IReadOnlyList<(string label, double hours)> e)
    {
        RenderOnUi(() =>
        {
        UsageBarChart.Plot.Clear();
        if (e.Count == 0)
        {
            UsageBarChart.Refresh();
            return;
        }

        var positions = Enumerable.Range(0, e.Count).Select(i => (double)i).ToArray();
        var values = e.Select(x => x.hours).ToArray();
        UsageBarChart.Plot.Add.Bars(positions, values);
        UsageBarChart.Plot.Title("Horas por aplicación (top 12)");
        UsageBarChart.Refresh();
        });
    }

    private void OnDailyPlotRequested(object? sender, IReadOnlyList<DailyUsagePoint> e)
    {
        RenderOnUi(() =>
        {
        DailyLineChart.Plot.Clear();
        if (e.Count == 0)
        {
            DailyLineChart.Refresh();
            return;
        }

        var xs = Enumerable.Range(0, e.Count).Select(i => (double)i).ToArray();
        var ys = e.Select(x => x.ActiveHours).ToArray();
        DailyLineChart.Plot.Add.Scatter(xs, ys);
        DailyLineChart.Plot.Title("Horas activas por día");
        DailyLineChart.Refresh();
        });
    }

    private void OnLogoutRequested(object? sender, EventArgs e)
    {
        if (Owner is not null)
        {
            Owner.Show();
        }
        Close();
    }
}


