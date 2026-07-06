using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Data;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Hosting;

internal sealed class MaintenanceWorker(
    ILogger<MaintenanceWorker> logger,
    IDbContextFactory<MonitorDbContext> dbContextFactory)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private static readonly TimeSpan RetentionPeriod = TimeSpan.FromDays(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunMaintenanceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Maintenance worker encountered an error.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunMaintenanceAsync(CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        var cutoff = DateTimeOffset.UtcNow.Subtract(RetentionPeriod);

        logger.LogInformation("Purging data older than {Cutoff}", cutoff);

        // SQLite no traduce bien DateTimeOffset en Where — filtramos en memoria.
        var allSessions = await dbContext.Sessions.ToListAsync(cancellationToken);
        var oldSessions = allSessions
            .Where(x => x.SessionEnd.HasValue && x.SessionEnd.Value < cutoff)
            .ToList();

        if (oldSessions.Count > 0)
        {
            dbContext.Sessions.RemoveRange(oldSessions);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        // Limpiar snapshots de ventanas legacy en SQLite (ahora van en memoria).
        try
        {
            await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM VisibleWindowSnapshots;");
        }
        catch
        {
            // tabla puede no existir en instalaciones antiguas
        }

        await GenerateDailySummariesAsync(dbContext, cancellationToken);
    }

    private static async Task GenerateDailySummariesAsync(MonitorDbContext dbContext, CancellationToken cancellationToken)
    {
        // Placeholder for aggregation logic.
        // TODO: Implement aggregation pipeline to populate DailyUsageSummary records.
        await Task.CompletedTask;
    }
}


