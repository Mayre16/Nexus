using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MonitorSuite.Service.Monitoring;
using MonitorSuite.Service.Persistence;
using MonitorSuite.Shared.Data;
using MonitorSuite.Shared.Domain;

namespace MonitorSuite.Service.Hosting;

internal sealed class MonitorWorker(
    ILogger<MonitorWorker> logger,
    IDatabaseBootstrapper databaseBootstrapper,
    IDbContextFactory<MonitorDbContext> dbContextFactory,
    IForegroundWindowTracker windowTracker,
    IInputActivityMonitor inputMonitor,
    ISessionStateMonitor sessionStateMonitor,
    IMonitoringSessionAccessor sessionAccessor,
    BrowserForegroundTracker browserTracker)
    : BackgroundService
{
    private readonly TimeSpan _pollInterval = TimeSpan.FromSeconds(5);
    private UsageSession? _session;
    private ApplicationUsageSlice? _currentSlice;
    private bool _currentSlicePersisted;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await databaseBootstrapper.EnsureCreatedAsync(stoppingToken);

        sessionStateMonitor.StatusChanged += OnSessionStatusChanged;
        sessionStateMonitor.Start();

        _session = await CreateNewSessionAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CaptureForegroundWindowAsync(stoppingToken);
                await CaptureInputSnapshotAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unexpected error during monitoring loop.");
            }

            try
            {
                await Task.Delay(_pollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        sessionStateMonitor.Stop();
        sessionStateMonitor.StatusChanged -= OnSessionStatusChanged;

        if (_session is not null)
        {
            await FinalizeSessionAsync(_session, stoppingToken);
        }
    }

    private async Task<UsageSession> CreateNewSessionAsync(CancellationToken cancellationToken)
    {
        var session = new UsageSession
        {
            SessionStart = DateTimeOffset.UtcNow,
            MachineName = Environment.MachineName,
            UserPrincipalName = Environment.UserName,
            Status = sessionStateMonitor.GetCurrentStatus()
        };

        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        dbContext.Sessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken);

        sessionAccessor.SetSession(session.Id);
        logger.LogInformation("Started monitoring session {SessionId} for user {User}", session.Id, session.UserPrincipalName);

        return session;
    }

    private async Task CaptureForegroundWindowAsync(CancellationToken cancellationToken)
    {
        if (_session is null)
        {
            return;
        }

        var slice = await windowTracker.CaptureActiveWindowAsync(cancellationToken);
        if (slice is null)
        {
            return;
        }

        slice.SessionId = _session.Id;
        slice.End = DateTimeOffset.UtcNow;

        if (_currentSlice is not null
            && _currentSlice.ProcessName == slice.ProcessName
            && _currentSlice.DisplayName == slice.DisplayName)
        {
            _currentSlice.End = slice.End;
            await UpdateSliceAsync(_currentSlice, cancellationToken);
        }
        else
        {
            if (_currentSlice is not null && _currentSlicePersisted)
            {
                _currentSlice.End = slice.Start;
                await UpdateSliceAsync(_currentSlice, cancellationToken);
            }

            _currentSlice = slice;
            await InsertSliceAsync(_currentSlice, cancellationToken);
            _currentSlicePersisted = true;
        }

        await browserTracker.ObserveAsync(slice, cancellationToken);
    }

    private async Task InsertSliceAsync(ApplicationUsageSlice slice, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        dbContext.ApplicationSlices.Add(slice);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task UpdateSliceAsync(ApplicationUsageSlice slice, CancellationToken cancellationToken)
    {
        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        dbContext.ApplicationSlices.Update(slice);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task CaptureInputSnapshotAsync(CancellationToken cancellationToken)
    {
        if (_session is null)
        {
            return;
        }

        var snapshot = inputMonitor.CaptureSnapshot(_session.Id);

        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        dbContext.InputSnapshots.Add(snapshot);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task FinalizeSessionAsync(UsageSession session, CancellationToken cancellationToken)
    {
        session.SessionEnd = DateTimeOffset.UtcNow;
        session.Status = SessionStatus.Ended;
        await browserTracker.FinalizeCurrentAsync(cancellationToken);
        sessionAccessor.ClearSession();

        await using var dbContext = await dbContextFactory.CreateDbContextAsync(cancellationToken);
        dbContext.Sessions.Update(session);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (_currentSlice is not null)
        {
            if (_currentSlicePersisted)
            {
                await UpdateSliceAsync(_currentSlice, cancellationToken);
            }
            _currentSlice = null;
            _currentSlicePersisted = false;
        }
    }

    private async void OnSessionStatusChanged(object? sender, SessionStatus status)
    {
        if (_session is null)
        {
            return;
        }

        await using var dbContext = await dbContextFactory.CreateDbContextAsync(CancellationToken.None);
        _session.Status = status;
        dbContext.Sessions.Update(_session);
        await dbContext.SaveChangesAsync();
    }
}


