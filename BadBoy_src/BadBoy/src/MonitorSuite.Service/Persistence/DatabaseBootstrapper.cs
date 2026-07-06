using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MonitorSuite.Shared.Data;

namespace MonitorSuite.Service.Persistence;

internal interface IDatabaseBootstrapper
{
    Task EnsureCreatedAsync(CancellationToken cancellationToken);
}

internal sealed class DatabaseBootstrapper(ILogger<DatabaseBootstrapper> logger, IDbContextFactory<MonitorDbContext> dbContextFactory)
    : IDatabaseBootstrapper
{
    public async Task EnsureCreatedAsync(CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);

        logger.LogInformation("Ensuring database schema is up to date.");
        await dbContext.Database.EnsureCreatedAsync(cancellationToken);

        await dbContext.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS VisibleWindowSnapshots (
                Id TEXT NOT NULL CONSTRAINT PK_VisibleWindowSnapshots PRIMARY KEY,
                SessionId TEXT NOT NULL,
                ProcessName TEXT NOT NULL,
                WindowTitle TEXT NOT NULL,
                IsForeground INTEGER NOT NULL,
                CapturedAt TEXT NOT NULL
            );
            """);
    }
}


