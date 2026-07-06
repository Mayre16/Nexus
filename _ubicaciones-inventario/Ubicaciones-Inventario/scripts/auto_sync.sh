#!/bin/bash
# FALLBACK: Wrapper HTTP para cron (cuando run_sync.py no está disponible)
# PREFERIR: scripts/run_sync.py --auto (sin HTTP, sin timeout)
#
# Uso: ./auto_sync.sh <BASE_URL> <CRON_TOKEN> [LOG_DIR]
# Ejemplo: ./auto_sync.sh "https://wms.adesa.com.do" "mi-token-secreto"
#
# Configurar en cPanel Cron Jobs cada 5 minutos (FALLBACK):
# */5 * * * * /home2/adesa/wms.adesa.com.do/scripts/auto_sync.sh "https://wms.adesa.com.do" "TU_TOKEN" >> /home2/adesa/wms.adesa.com.do/logs/Sync-wms/auto_sync_fallback.log 2>&1

set -e

BASE_URL="${1:-}"
TOKEN="${2:-}"
LOG_DIR="${3:-}"

if [ -z "$LOG_DIR" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    LOG_DIR="${SCRIPT_DIR%/scripts}/logs"
    [ -d "$LOG_DIR" ] || LOG_DIR="/home2/adesa/wms.adesa.com.do/logs/Sync-wms"
fi

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/auto_sync_$(date +%Y%m%d).log"
TMP_SYNC="/tmp/auto_sync_response_$$.txt"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

if [ -z "$BASE_URL" ] || [ -z "$TOKEN" ]; then
    log "ERROR: Uso: $0 <BASE_URL> <CRON_TOKEN> [LOG_DIR]"
    exit 1
fi

TICK_URL="${BASE_URL}/api/sincronizar/auto/tick"
TMP_RESP="/tmp/auto_sync_tick_$$.json"

# 1. Tick (timeout 60s - parche temporal)
log "Tick: $TICK_URL (timeout 60s)"
RESP=$(curl -s -S -m 60 -w "\n%{http_code}" -X POST "$TICK_URL" \
    -H "Content-Type: application/json" \
    -H "X-CRON-TOKEN: $TOKEN" 2>>"$LOG_FILE") || RESP="{}"$'\n'"000"
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)
echo "$HTTP_BODY" > "$TMP_RESP"
log "Tick HTTP $HTTP_CODE"

# 2. Parsear JSON
PY=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "python3")
STATUS=$($PY -c "
import json
try:
    with open('$TMP_RESP') as f:
        d = json.load(f)
    print(d.get('status', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")
LOC_ID=$($PY -c "
import json
try:
    with open('$TMP_RESP') as f:
        d = json.load(f)
    print(d.get('location_id', ''))
except Exception:
    print('')
" 2>/dev/null || echo "")
TARGET=$($PY -c "
import json
try:
    with open('$TMP_RESP') as f:
        d = json.load(f)
    print(d.get('target', 'full'))
except Exception:
    print('full')
" 2>/dev/null || echo "full")

rm -f "$TMP_RESP"

log "Tick response: status=$STATUS location_id=$LOC_ID target=$TARGET"

# 3. Si ready, disparar sync (timeout 300s - parche temporal)
if [ "$STATUS" = "ready" ] && [ -n "$LOC_ID" ]; then
    if [ "$TARGET" = "lote" ]; then
        SYNC_URL="${BASE_URL}/api/sincronizar/ubicacion/${LOC_ID}/lote"
    else
        SYNC_URL="${BASE_URL}/api/sincronizar/ubicacion/${LOC_ID}"
    fi
    log "Disparando sync: $SYNC_URL (timeout 300s)"
    SYNC_RESP=$(curl -s -S -m 300 -w "\n%{http_code}" -X POST "$SYNC_URL" \
        -H "Content-Type: application/json" \
        -H "X-CRON-TOKEN: $TOKEN" 2>>"$LOG_FILE") || true
    SYNC_HTTP=$(echo "$SYNC_RESP" | tail -n 1)
    SYNC_BODY=$(echo "$SYNC_RESP" | head -n -1)
    log "Sync HTTP $SYNC_HTTP | body_len=${#SYNC_BODY}"
else
    log "No action: status=$STATUS"
fi

rm -f "$TMP_SYNC" 2>/dev/null || true
