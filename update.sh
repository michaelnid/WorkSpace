#!/bin/bash
# ============================================
# MIKE WorkSpace - Multi-Branch Update Script
# Erstellt vor dem Update automatisch ein Backup.
#
# Usage:
#   sudo bash update.sh [--branch main|dev|experimental]
#
# Falls kein Branch angegeben: liest den konfigurierten Branch
# aus der Datenbank (settings-Tabelle).
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

APP_DIR="/opt/mike-workspace"
APP_USER="mike"
SERVICE="mike-workspace"
BACKUP_BASE_DIR="$APP_DIR/backups/pre-update"

echo ""
echo -e "${BOLD}MIKE WorkSpace - Update${NC}"
echo -e "================================================"

# Root-Check
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}[FAIL]${NC} Dieses Script muss als root ausgefuehrt werden."
  echo -e "  Verwende: ${CYAN}sudo bash update.sh --branch main${NC}"
  exit 1
fi

# ============================================
# Branch bestimmen
# ============================================
BRANCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}[FAIL]${NC} Unbekannter Parameter: $1"
      echo -e "  Usage: ${CYAN}sudo bash update.sh --branch main|dev|experimental${NC}"
      exit 1
      ;;
  esac
done

# Falls kein Branch angegeben: aus DB lesen
if [ -z "$BRANCH" ]; then
  echo -e "\n${CYAN}> Branch aus Konfiguration lesen...${NC}"
  
  # .env lesen fuer DB-Verbindung
  if [ -f "$APP_DIR/backend/.env" ]; then
    DB_NAME=$(grep '^DB_NAME=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
    DB_USER_ENV=$(grep '^DB_USER=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
    DB_PASS=$(grep '^DB_PASSWORD=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
    
    if [ -n "$DB_NAME" ] && [ -n "$DB_USER_ENV" ]; then
      # Versuche Branch aus settings-Tabelle zu lesen
      DB_BRANCH=$(mysql -u "$DB_USER_ENV" -p"$DB_PASS" "$DB_NAME" -N -e \
        "SELECT value_encrypted FROM settings WHERE \`key\` = 'update.branch' AND tenant_id IS NULL LIMIT 1;" 2>/dev/null || echo "")
      
      # Der Wert ist verschluesselt, aber wir koennen den Branch auch aus dem Git-Zustand lesen
      if [ -z "$DB_BRANCH" ] || [ "$DB_BRANCH" = "NULL" ]; then
        # Fallback: Aktuellen Git-Branch verwenden
        cd "$APP_DIR"
        BRANCH=$(sudo -u "$APP_USER" git branch --show-current 2>/dev/null || echo "main")
      else
        # Verschluesselter Wert - Fallback auf Git-Branch
        cd "$APP_DIR"
        BRANCH=$(sudo -u "$APP_USER" git branch --show-current 2>/dev/null || echo "main")
      fi
    fi
  fi
  
  # Ultimativer Fallback
  if [ -z "$BRANCH" ]; then
    BRANCH="main"
  fi
fi

# Branch validieren
case "$BRANCH" in
  main|dev|experimental) ;;
  *)
    echo -e "${RED}[FAIL]${NC} Ungueltiger Branch: '$BRANCH'"
    echo -e "  Erlaubt: ${CYAN}main${NC}, ${CYAN}dev${NC}, ${CYAN}experimental${NC}"
    exit 1
    ;;
esac

echo -e "  ${GREEN}[OK]${NC} Branch: ${BOLD}$BRANCH${NC}"

# ============================================
# Aktuellen Stand anzeigen
# ============================================
echo -e "\n${CYAN}> Aktueller Stand...${NC}"
cd "$APP_DIR"

CURRENT_BRANCH=$(sudo -u "$APP_USER" git branch --show-current 2>/dev/null || echo "unbekannt")
CURRENT_COMMIT=$(sudo -u "$APP_USER" git rev-parse --short HEAD 2>/dev/null || echo "unbekannt")
CURRENT_VERSION="unbekannt"
if [ -f "$APP_DIR/backend/package.json" ]; then
  CURRENT_VERSION=$(node -e "try{console.log(require('$APP_DIR/backend/package.json').version)}catch{console.log('unbekannt')}" 2>/dev/null || echo "unbekannt")
fi

echo -e "  Version:  ${BOLD}v$CURRENT_VERSION${NC}"
echo -e "  Branch:   ${BOLD}$CURRENT_BRANCH${NC}"
echo -e "  Commit:   ${BOLD}$CURRENT_COMMIT${NC}"

# ============================================
# Pre-Update Backup erstellen
# ============================================
echo -e "\n${CYAN}> Pre-Update Backup erstellen...${NC}"

BACKUP_DIR="$BACKUP_BASE_DIR/$BRANCH"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/pre-update_${TIMESTAMP}.zip"

# Datenbank-Dump erstellen
echo -e "  Erstelle Datenbank-Dump..."
DB_DUMP_FILE="/tmp/mike-workspace-db-dump-${TIMESTAMP}.sql"

if [ -f "$APP_DIR/backend/.env" ]; then
  DB_NAME=$(grep '^DB_NAME=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
  DB_USER_ENV=$(grep '^DB_USER=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
  DB_PASS=$(grep '^DB_PASSWORD=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
  DB_HOST=$(grep '^DB_HOST=' "$APP_DIR/backend/.env" | cut -d'=' -f2)
  DB_PORT=$(grep '^DB_PORT=' "$APP_DIR/backend/.env" | cut -d'=' -f2)

  if [ -n "$DB_NAME" ] && [ -n "$DB_USER_ENV" ]; then
    mysqldump -u "$DB_USER_ENV" -p"$DB_PASS" \
      -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" \
      --single-transaction --routines --triggers \
      "$DB_NAME" > "$DB_DUMP_FILE" 2>/dev/null
    echo -e "  ${GREEN}[OK]${NC} Datenbank-Dump erstellt"
  else
    echo -e "  ${YELLOW}[!!]${NC} DB-Verbindungsdaten nicht vollstaendig, Dump uebersprungen"
    DB_DUMP_FILE=""
  fi
else
  echo -e "  ${YELLOW}[!!]${NC} Keine .env-Datei gefunden, Dump uebersprungen"
  DB_DUMP_FILE=""
fi

# Backup-Metadaten erstellen
META_FILE="/tmp/mike-workspace-backup-meta-${TIMESTAMP}.json"
cat > "$META_FILE" <<METAEOF
{
  "version": "$CURRENT_VERSION",
  "branch": "$CURRENT_BRANCH",
  "commit": "$CURRENT_COMMIT",
  "timestamp": "$(date -Iseconds)",
  "type": "pre-update"
}
METAEOF

# ZIP erstellen (ohne node_modules, .git, tmp)
echo -e "  Erstelle ZIP-Archiv..."

cd "$APP_DIR"

# Dateien fuer ZIP sammeln (relativ zum APP_DIR)
ZIP_ARGS=()
ZIP_ARGS+=("-x" "*/node_modules/*" "*/.git/*" "*/tmp/*" "*/backups/*")

zip -r -q "$BACKUP_FILE" \
  backend/ \
  frontend/ \
  plugins/ \
  uploads/ \
  install.sh \
  update.sh \
  restore.sh \
  CHANGELOG.md \
  README.md \
  -x "*/node_modules/*" "*/.git/*" "*/tmp/*" "*/backups/*" 2>/dev/null || true

# DB-Dump und Meta zum ZIP hinzufuegen
if [ -n "$DB_DUMP_FILE" ] && [ -f "$DB_DUMP_FILE" ]; then
  zip -j -q "$BACKUP_FILE" "$DB_DUMP_FILE" 2>/dev/null || true
  rm -f "$DB_DUMP_FILE"
fi

if [ -f "$META_FILE" ]; then
  zip -j -q "$BACKUP_FILE" "$META_FILE" 2>/dev/null || true
  rm -f "$META_FILE"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" 2>/dev/null | cut -f1)
echo -e "  ${GREEN}[OK]${NC} Backup erstellt: ${BOLD}$BACKUP_FILE${NC} ($BACKUP_SIZE)"

# Alte Backups aufraeumen
case "$BRANCH" in
  main|dev) MAX_BACKUPS=5 ;;
  experimental) MAX_BACKUPS=10 ;;
  *) MAX_BACKUPS=5 ;;
esac

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/pre-update_*.zip 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  ls -1t "$BACKUP_DIR"/pre-update_*.zip 2>/dev/null | tail -n "$DELETE_COUNT" | while read -r OLD_BACKUP; do
    rm -f "$OLD_BACKUP"
    echo -e "  ${YELLOW}[!!]${NC} Altes Backup entfernt: $(basename "$OLD_BACKUP")"
  done
fi

# ============================================
# Git Pull (Branch-spezifisch)
# ============================================
echo -e "\n${CYAN}> Git Update (Branch: $BRANCH)...${NC}"
cd "$APP_DIR"

# Sicherstellen dass origin korrekt konfiguriert ist
REMOTE_URL=$(sudo -u "$APP_USER" git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
  echo -e "  ${RED}[FAIL]${NC} Kein Git-Remote 'origin' konfiguriert."
  exit 1
fi

sudo -u "$APP_USER" git fetch origin 2>&1
sudo -u "$APP_USER" git checkout "$BRANCH" 2>&1 || {
  # Falls Branch nicht existiert: Remote-Branch auschecken
  sudo -u "$APP_USER" git checkout -b "$BRANCH" "origin/$BRANCH" 2>&1
}
sudo -u "$APP_USER" git reset --hard "origin/$BRANCH" 2>&1
echo -e "  ${GREEN}[OK]${NC} Quellcode aktualisiert (Branch: $BRANCH)"

NEW_COMMIT=$(sudo -u "$APP_USER" git rev-parse --short HEAD 2>/dev/null || echo "unbekannt")
echo -e "  Neuer Commit: ${BOLD}$NEW_COMMIT${NC}"

# ============================================
# Backend Dependencies
# ============================================
echo -e "\n${CYAN}> Backend Dependencies...${NC}"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npm ci --omit=dev --silent --no-audit 2>/dev/null || sudo -u "$APP_USER" npm install --omit=dev --silent --no-audit 2>/dev/null
sudo -u "$APP_USER" npm install --save-dev typescript tsx 2>/dev/null
echo -e "  ${GREEN}[OK]${NC} Dependencies installiert"

# ============================================
# Frontend Build (falls Vite vorhanden)
# ============================================
if [ -f "$APP_DIR/frontend/package.json" ] && grep -q '"build"' "$APP_DIR/frontend/package.json" 2>/dev/null; then
  if [ -d "$APP_DIR/frontend/node_modules" ] || [ -f "$APP_DIR/frontend/package-lock.json" ]; then
    echo -e "\n${CYAN}> Frontend Build...${NC}"
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm ci --silent 2>/dev/null || true
    sudo -u "$APP_USER" npm run build --silent 2>/dev/null || true
    echo -e "  ${GREEN}[OK]${NC} Frontend gebaut"
  fi
fi

# ============================================
# Datenbank-Migrationen
# ============================================
echo -e "\n${CYAN}> Datenbank-Migrationen...${NC}"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npx tsx node_modules/.bin/knex migrate:latest --knexfile knexfile.ts 2>/dev/null
echo -e "  ${GREEN}[OK]${NC} Migrationen ausgefuehrt"

# ============================================
# Systemd-Service aktualisieren
# ============================================
echo -e "\n${CYAN}> Service-Konfiguration pruefen...${NC}"
SERVICE_FILE="/etc/systemd/system/${SERVICE}.service"
if [ -f "$SERVICE_FILE" ]; then
  if ! grep -q "TimeoutStopSec" "$SERVICE_FILE"; then
    sed -i '/^Environment=NODE_ENV=production$/a\\n# Stop-Verhalten: max 10s warten, dann SIGKILL\nTimeoutStopSec=10\nKillMode=mixed\nKillSignal=SIGTERM' "$SERVICE_FILE"
    systemctl daemon-reload
    echo -e "  ${GREEN}[OK]${NC} Service-Timeouts aktualisiert"
  else
    echo -e "  ${GREEN}[OK]${NC} Service-Konfiguration bereits aktuell"
  fi
fi

# ============================================
# Service neu starten
# ============================================
echo -e "\n${CYAN}> Service neu starten...${NC}"
systemctl restart "$SERVICE"
sleep 2

if systemctl is-active --quiet "$SERVICE"; then
  echo -e "  ${GREEN}[OK]${NC} Service laeuft"
else
  echo -e "  ${RED}[FAIL]${NC} Service konnte nicht gestartet werden"
  echo -e "  Logs: ${CYAN}sudo journalctl -u $SERVICE -f${NC}"
  echo ""
  echo -e "  ${YELLOW}Restore-Befehl:${NC}"
  echo -e "  ${CYAN}sudo bash $APP_DIR/restore.sh $BACKUP_FILE${NC}"
  exit 1
fi

# ============================================
# Neue Version ermitteln
# ============================================
NEW_VERSION="unbekannt"
if [ -f "$APP_DIR/backend/package.json" ]; then
  NEW_VERSION=$(node -e "try{console.log(require('$APP_DIR/backend/package.json').version)}catch{console.log('unbekannt')}" 2>/dev/null || echo "unbekannt")
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Update erfolgreich!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "  ${BOLD}Branch:${NC}    $BRANCH"
echo -e "  ${BOLD}Version:${NC}   v$NEW_VERSION"
echo -e "  ${BOLD}Commit:${NC}    $NEW_COMMIT"
echo ""
echo -e "  ${BOLD}Backup:${NC}    $BACKUP_FILE"
echo -e "  ${BOLD}Restore:${NC}   ${CYAN}sudo bash $APP_DIR/restore.sh $BACKUP_FILE${NC}"
echo ""
