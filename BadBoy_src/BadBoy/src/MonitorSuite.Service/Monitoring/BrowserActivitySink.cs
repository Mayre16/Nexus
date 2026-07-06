using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Data;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Monitoring;

internal sealed class BrowserActivitySink(
    ILogger<BrowserActivitySink> logger,
    IDbContextFactory<MonitorDbContext> dbContextFactory)
    : IBrowserActivitySink
{
    public async Task RecordAsync(BrowserActivityEntry entry, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        dbContext.BrowserEntries.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogDebug("Recorded browser activity for {Browser} {Url}", entry.Browser, entry.Url);
    }
}


