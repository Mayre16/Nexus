using System.Windows;
using MonitorSuite.Shared.Config;

namespace MonitorSuite.Admin.Views;

public partial class MachineProfileWindow : Window
{
    public MachineProfile Profile { get; }

    public MachineProfileWindow()
    {
        Profile = MachineProfileStore.Load();
        InitializeComponent();
        DataContext = Profile;
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(Profile.DisplayName))
        {
            MessageBox.Show("Indica el nombre del empleado que usa este equipo.", "ADESA MonitorSuite",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        MachineProfileStore.Save(Profile);
        DialogResult = true;
        Close();
    }
}
