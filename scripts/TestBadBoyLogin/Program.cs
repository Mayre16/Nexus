using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

var pipeName = "MonitorSuitePipe";
var pipePath = $@"\\.\pipe\{pipeName}";

Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Pipe existe: {File.Exists(pipePath)}");
if (!File.Exists(pipePath))
{
    Console.WriteLine("RESULTADO: FALLO - agente apagado");
    return 1;
}

var loginJson = JsonSerializer.Serialize(new
{
    type = "login",
    payload = new { Username = "admin", Password = "ChangeMe!2025", OneTimeCode = (string?)null }
});

try
{
    using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.None);
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Conectando...");
    await Task.Run(() => client.Connect(5000));
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Conectado.");
    using var writer = new StreamWriter(client, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };
    using var reader = new StreamReader(client, Encoding.UTF8, leaveOpen: true);
    writer.WriteLine(loginJson);
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Login enviado, esperando respuesta...");
    var ioTask = Task.Run(() => reader.ReadLine());
    var line = ioTask.Wait(8000)
        ? ioTask.Result
        : throw new TimeoutException("Sin respuesta del agente en 8 s");
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Respuesta: {line}");
    if (line?.Contains("true", StringComparison.OrdinalIgnoreCase) == true && line.Contains("SessionToken"))
    {
        Console.WriteLine("RESULTADO: OK - login exitoso");
        return 0;
    }

    Console.WriteLine("RESULTADO: FALLO - credenciales o respuesta invalida");
    return 2;
}
catch (Exception ex)
{
    Console.WriteLine($"RESULTADO: FALLO - {ex.Message}");
    return 3;
}
