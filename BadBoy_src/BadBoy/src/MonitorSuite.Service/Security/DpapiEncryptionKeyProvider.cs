using System.Security.Cryptography;
using System.Text;

namespace MonitorSuite.Service.Security;

internal sealed class DpapiEncryptionKeyProvider : IEncryptionKeyProvider
{
    private static readonly string KeyPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MonitorSuite",
        "Config",
        "db.key");

    private readonly object _sync = new();

    public byte[] GetOrCreateDatabaseKey()
    {
        lock (_sync)
        {
            if (File.Exists(KeyPath))
            {
                var protectedData = File.ReadAllBytes(KeyPath);
                return ProtectedData.Unprotect(protectedData, null, DataProtectionScope.LocalMachine);
            }

            var randomKey = RandomNumberGenerator.GetBytes(32);
            Directory.CreateDirectory(Path.GetDirectoryName(KeyPath)!);

            var protectedBytes = ProtectedData.Protect(randomKey, null, DataProtectionScope.LocalMachine);
            File.WriteAllBytes(KeyPath, protectedBytes);
            return randomKey;
        }
    }

    public void RotateDatabaseKey()
    {
        lock (_sync)
        {
            var newKey = RandomNumberGenerator.GetBytes(32);
            Directory.CreateDirectory(Path.GetDirectoryName(KeyPath)!);
            var protectedBytes = ProtectedData.Protect(newKey, null, DataProtectionScope.LocalMachine);
            File.WriteAllBytes(KeyPath, protectedBytes);
        }
    }
}


