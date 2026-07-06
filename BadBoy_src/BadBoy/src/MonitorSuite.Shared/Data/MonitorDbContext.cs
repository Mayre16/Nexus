using Microsoft.EntityFrameworkCore;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Shared.Data;

public sealed class MonitorDbContext(DbContextOptions<MonitorDbContext> options) : DbContext(options)
{
    public DbSet<UsageSession> Sessions => Set<UsageSession>();

    public DbSet<ApplicationUsageSlice> ApplicationSlices => Set<ApplicationUsageSlice>();

    public DbSet<BrowserActivityEntry> BrowserEntries => Set<BrowserActivityEntry>();

    public DbSet<VisibleWindowSnapshot> VisibleWindowSnapshots => Set<VisibleWindowSnapshot>();

    public DbSet<InputSnapshot> InputSnapshots => Set<InputSnapshot>();

    public DbSet<DailyUsageSummary> DailySummaries => Set<DailyUsageSummary>();

    public DbSet<AdminAuditEntry> AuditEntries => Set<AdminAuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UsageSession>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.MachineName).HasMaxLength(200);
            entity.Property(x => x.UserPrincipalName).HasMaxLength(320);
            entity.HasMany(x => x.ApplicationSlices)
                  .WithOne()
                  .HasForeignKey(x => x.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.BrowserEntries)
                  .WithOne()
                  .HasForeignKey(x => x.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.InputSnapshots)
                  .WithOne()
                  .HasForeignKey(x => x.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ApplicationUsageSlice>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ProcessName).HasMaxLength(200);
            entity.Property(x => x.DisplayName).HasMaxLength(260);
            entity.Property(x => x.ExecutablePath).HasMaxLength(520);
        });

        modelBuilder.Entity<BrowserActivityEntry>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Browser).HasMaxLength(120);
            entity.Property(x => x.Url).HasMaxLength(2048);
            entity.Property(x => x.Title).HasMaxLength(512);
        });

        modelBuilder.Entity<VisibleWindowSnapshot>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ProcessName).HasMaxLength(200);
            entity.Property(x => x.WindowTitle).HasMaxLength(512);
        });

        modelBuilder.Entity<InputSnapshot>(entity =>
        {
            entity.HasKey(x => x.Id);
        });

        modelBuilder.Entity<DailyUsageSummary>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.MachineName).HasMaxLength(200);
            entity.Property(x => x.UserPrincipalName).HasMaxLength(320);

            entity.OwnsMany(x => x.Applications, builder =>
            {
                builder.WithOwner().HasForeignKey("DailyUsageSummaryId");
                builder.HasKey(x => x.Id);
                builder.Property(x => x.Application).HasMaxLength(260);
            });

            entity.OwnsMany(x => x.Browsers, builder =>
            {
                builder.WithOwner().HasForeignKey("DailyUsageSummaryId");
                builder.HasKey(x => x.Id);
                builder.Property(x => x.Browser).HasMaxLength(120);
                builder.Property(x => x.Url).HasMaxLength(2048);
            });
        });

        modelBuilder.Entity<AdminAuditEntry>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Actor).HasMaxLength(260);
            entity.Property(x => x.Operation).HasMaxLength(260);
        });
    }
}


