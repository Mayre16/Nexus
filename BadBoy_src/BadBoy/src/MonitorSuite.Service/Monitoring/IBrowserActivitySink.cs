using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

public interface IBrowserActivitySink
{
    Task RecordAsync(BrowserActivityEntry entry, CancellationToken cancellationToken);
}


