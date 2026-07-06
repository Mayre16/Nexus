using System.IO;
using System.IO.Pipes;

for (var i = 0; i < 30; i++)
{
    await Task.Delay(500);
    var exists = File.Exists(@"\\.\pipe\MonitorSuitePipe");
    if (!exists)
    {
        Console.WriteLine($"{i * 500}ms: no pipe");
        continue;
    }

    try
    {
        using var client = new NamedPipeClientStream(".", "MonitorSuitePipe", PipeDirection.InOut, PipeOptions.Asynchronous);
        var connect = client.ConnectAsync(800);
        if (await Task.WhenAny(connect, Task.Delay(900)) == connect)
        {
            await connect;
            Console.WriteLine($"{i * 500}ms: CONNECTED ok={client.IsConnected}");
            return;
        }

        Console.WriteLine($"{i * 500}ms: pipe exists, connect timeout");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"{i * 500}ms: pipe exists, error {ex.Message}");
    }
}

Console.WriteLine("FAIL never connected");
Environment.Exit(1);
