namespace MonitorSuite.Shared.Contracts;

/// <summary>
/// Represents a login attempt from the admin console.
/// </summary>
public sealed record AdminLoginRequest(string Username, string Password, string? OneTimeCode);

public sealed record AdminMicrosoftLoginRequest(string AccessToken);

/// <summary>
/// Response after validating admin credentials.
/// </summary>
public sealed record AdminLoginResponse(bool Succeeded, string? FailureReason, string? SessionToken, string? Username = null);

/// <summary>
/// Token used to authenticate subsequent admin actions.
/// </summary>
public sealed record AdminSessionToken(string Token, DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt);

/// <summary>
/// Request to invalidate an active admin session.
/// </summary>
public sealed record AdminLogoutRequest(string SessionToken);

/// <summary>
/// Request to rotate the shared encryption keys.
/// </summary>
public sealed record RotateKeyRequest(string SessionToken, string Reason);


