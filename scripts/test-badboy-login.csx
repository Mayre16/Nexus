using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

const string pipeName = "MonitorSuitePipe";
const string pipePath = $@"\\.\pipe\{pipeName}";

Console.WriteLine($"Pipe existe: {File.Exists(pipePath)}");
if (!File.Exists(pipePath))
{
    Console.WriteLine("FALLO: agente no responde.");
    return 1;
}

var loginJson = JsonSerializer.Serialize(new
{
    type = "login",
    payload = new { Username = "admin", Password = "ChangeMe!2025", OneTimeCode = (string?)null }
});

try
{
    using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    await client.ConnectAsync(cts.Token);
    using var writer = new StreamWriter(client, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };
    using var reader = new StreamReader(client, Encoding.UTF8, leaveOpen: true);
    await writer.WriteLineAsync(loginJson);
    var line = await reader.ReadLineAsync(cts.Token);
    Console.WriteLine($"Respuesta: {line}");
    return line?.Contains("\"Succeeded\":true", StringComparison.OrdinalIgnoreCase) == true ? 0 : 2;
}
catch (Exception ex)
{
    Console.WriteLine($"FALLO login: {ex.Message}");
    return 3;
}
