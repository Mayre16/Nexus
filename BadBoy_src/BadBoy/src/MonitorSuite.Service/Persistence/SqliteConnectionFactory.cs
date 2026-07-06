using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using MonitorSuite.Service.Security;

namespace MonitorSuite.Service.Persistence;

internal static class SqliteConnectionFactory
{
    private const string DatabaseFileName = "monitor_suite.db";

    public static string Create(string dataDirectory, IEncryptionKeyProvider keyProvider)
    {
        var databasePath = Path.Combine(dataDirectory, DatabaseFileName);

        var connectionStringBuilder = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        };

        var keyBytes = keyProvider.GetOrCreateDatabaseKey();
        if (keyBytes is null || keyBytes.Length == 0)
        {
            throw new CryptographicException("Could not obtain encryption key.");
        }

        connectionStringBuilder.Add("Password", Convert.ToBase64String(keyBytes));
        connectionStringBuilder.Add("Foreign Keys", true);

        return connectionStringBuilder.ToString();
    }
}


