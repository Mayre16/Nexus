namespace MonitorSuite.Service.Security;

public interface IEncryptionKeyProvider
{
    byte[] GetOrCreateDatabaseKey();

    void RotateDatabaseKey();
}


