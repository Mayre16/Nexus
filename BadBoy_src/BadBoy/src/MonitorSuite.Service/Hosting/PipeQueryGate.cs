namespace MonitorSuite.Service.Hosting;

/// <summary>
/// Evita consultas pesadas simultáneas que bloquean SQLite y congelan el panel.
/// </summary>
internal sealed class PipeQueryGate
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<T> RunAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return await action();
        }
        finally
        {
            _gate.Release();
        }
    }
}
