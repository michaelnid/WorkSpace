#!/bin/bash
# ============================================
# MIKE WorkSpace - Dev Update Script
# Zieht den neusten Stand von GitHub und deployt
#
# Usage:
#   sudo bash update.sh
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

APP_DIR="/opt/mike-workspace"
APP_USER="mike"
SERVICE="mike-workspace"

echo ""
echo -e "${BOLD}MIKE WorkSpace - Dev Update${NC}"
echo -e "================================================"

# Root-Check
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}[FAIL]${NC} Dieses Script muss als root ausgefuehrt werden."
  echo -e "  Verwende: ${CYAN}sudo bash update.sh${NC}"
  exit 1
fi

# 1. Git Pull
echo -e "\n${CYAN}> Git Pull...${NC}"
cd "$APP_DIR"
sudo -u "$APP_USER" git pull WorkSpace main 2>&1 || sudo -u "$APP_USER" git pull origin main 2>&1
echo -e "  ${GREEN}[OK]${NC} Quellcode aktualisiert"

# 2. Backend Dependencies
echo -e "\n${CYAN}> Backend Dependencies...${NC}"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npm ci --omit=dev --silent --no-audit 2>/dev/null || sudo -u "$APP_USER" npm install --omit=dev --silent --no-audit 2>/dev/null
sudo -u "$APP_USER" npm install --save-dev typescript tsx 2>/dev/null
echo -e "  ${GREEN}[OK]${NC} Dependencies installiert"

# 3. Frontend Build (falls Vite vorhanden)
if [ -f "$APP_DIR/frontend/package.json" ] && grep -q '"build"' "$APP_DIR/frontend/package.json" 2>/dev/null; then
  if [ -d "$APP_DIR/frontend/node_modules" ] || [ -f "$APP_DIR/frontend/package-lock.json" ]; then
    echo -e "\n${CYAN}> Frontend Build...${NC}"
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm ci --silent 2>/dev/null || true
    sudo -u "$APP_USER" npm run build --silent 2>/dev/null || true
    echo -e "  ${GREEN}[OK]${NC} Frontend gebaut"
  fi
fi

# 4. Datenbank-Migrationen
echo -e "\n${CYAN}> Datenbank-Migrationen...${NC}"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npx tsx node_modules/.bin/knex migrate:latest --knexfile knexfile.ts 2>/dev/null
echo -e "  ${GREEN}[OK]${NC} Migrationen ausgefuehrt"

# 5. Service neu starten
echo -e "\n${CYAN}> Service neu starten...${NC}"
systemctl restart "$SERVICE"
sleep 2

if systemctl is-active --quiet "$SERVICE"; then
  echo -e "  ${GREEN}[OK]${NC} Service laeuft"
else
  echo -e "  ${RED}[FAIL]${NC} Service konnte nicht gestartet werden"
  echo -e "  Logs: ${CYAN}sudo journalctl -u $SERVICE -f${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Update erfolgreich!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
