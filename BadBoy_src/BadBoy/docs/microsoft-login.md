# Login Microsoft (MFA) para BadBoy Admin

1. En [Azure Portal](https://portal.azure.com) → **App registrations** → New registration
2. Nombre: `ADESA BadBoy Admin`
3. Supported account types: solo tu organización
4. Redirect URI: **Public client/native** → `http://localhost`
5. Copie **Application (client) ID** y **Directory (tenant) ID**
6. API permissions → Add → Microsoft Graph → Delegated → `User.Read` → Grant admin consent
7. Edite `%PROGRAMDATA%\MonitorSuite\Config\azure_ad.json`:

```json
{
  "Enabled": true,
  "TenantId": "...",
  "ClientId": "...",
  "AllowedEmails": ["martha@adesa.com.do"]
}
```

8. Reinicie el agente BadBoy. En el login del panel aparecerá **Iniciar sesión con Microsoft (MFA)**.

Microsoft pedirá su contraseña + OTP/authenticator automáticamente.
