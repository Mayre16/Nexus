using System.Linq;
using System.Reflection;

Console.WriteLine("ScottPlot Pie metadata\n");

var scottPlotAssembly = typeof(ScottPlot.Plot).Assembly;

var pieType = scottPlotAssembly.GetType("ScottPlot.Plottables.Pie")
              ?? throw new InvalidOperationException("Pie type not found.");
Console.WriteLine($"Type: {pieType.FullName}");

Console.WriteLine("\nProperties:");
foreach (var prop in pieType.GetProperties(BindingFlags.Public | BindingFlags.Instance))
{
    Console.WriteLine($" - {prop.PropertyType.Name} {prop.Name}");
}

Console.WriteLine("\nMethods:");
foreach (var method in pieType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
{
    var parameters = string.Join(", ", method.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
    Console.WriteLine($" - {method.ReturnType.Name} {method.Name}({parameters})");
}

Console.WriteLine("\nPlot methods containing 'Pie':");
var pieMethods = typeof(ScottPlot.Plot).GetMethods(BindingFlags.Public | BindingFlags.Instance)
    .Where(m => m.Name.Contains("Pie", StringComparison.OrdinalIgnoreCase));

foreach (var method in pieMethods.OrderBy(m => m.Name))
{
    var parameters = string.Join(", ", method.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
    Console.WriteLine($" - {method.ReturnType.Name} {method.Name}({parameters})");
}

Console.WriteLine("\nPieSlice members:");
var sliceType = scottPlotAssembly.GetTypes()
    .FirstOrDefault(t => t.Name.Contains("PieSlice", StringComparison.OrdinalIgnoreCase));

if (sliceType is null)
{
    Console.WriteLine(" - PieSlice type not found");
    return;
}

Console.WriteLine($"Type: {sliceType.FullName}");
foreach (var ctor in sliceType.GetConstructors())
{
    var parameters = string.Join(", ", ctor.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
    Console.WriteLine($" - ctor({parameters})");
}
foreach (var prop in sliceType.GetProperties())
{
    Console.WriteLine($" - {prop.PropertyType.Name} {prop.Name}");
}
