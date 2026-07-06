# Extensión Chrome/Edge — URLs exactas para BadBoy

La extensión envía cada pestaña activa al agente local en `http://127.0.0.1:19642/browser-visit`.

## Instalación (modo desarrollo)

1. Abra Chrome o Edge → `chrome://extensions` o `edge://extensions`
2. Active **Modo desarrollador**
3. **Cargar extensión sin empaquetar** → seleccione esta carpeta:
   `BadBoy_src/BrowserExtension`
4. Asegúrese de que el agente BadBoy esté corriendo (`scripts/run-badboy-local.ps1`)

Sin la extensión, BadBoy registra el **título de la pestaña** pero no la URL completa.
