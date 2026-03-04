#!/bin/bash
# ============================================
# MIKE Plugin-Build – Standalone
#
# Baut ein einzelnes Plugin als signierten tar.gz
# mit version.json fuer die Update-Infrastruktur.
#
# Voraussetzungen:
#   - Node.js installiert
#   - TypeScript-Compiler verfuegbar (wenn backend/*.ts genutzt wird)
#   - .signing-key.pem im Plugin-Verzeichnis oder uebergeordnet
#     ODER UPDATE_SIGNING_PRIVATE_KEY als Umgebungsvariable gesetzt
#
# Usage:
#   cd mein-plugin/
#   bash build-plugin.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin-Metadaten aus plugin.json lesen
if [ ! -f "$SCRIPT_DIR/plugin.json" ]; then
  echo "[FEHLER] Keine plugin.json im aktuellen Verzeichnis gefunden!"
  echo "         Starte dieses Script aus dem Plugin-Verzeichnis."
  exit 1
fi

PLUGIN_ID=$(node -p "require('$SCRIPT_DIR/plugin.json').id" 2>/dev/null)
PLUGIN_VERSION=$(node -p "require('$SCRIPT_DIR/plugin.json').version" 2>/dev/null)
PLUGIN_NAME=$(node -p "require('$SCRIPT_DIR/plugin.json').name || ''" 2>/dev/null)
PLUGIN_DESC=$(node -p "require('$SCRIPT_DIR/plugin.json').description || ''" 2>/dev/null)
PLUGIN_AUTHOR=$(node -p "require('$SCRIPT_DIR/plugin.json').author || ''" 2>/dev/null)
PLUGIN_DEPS=$(node -p "JSON.stringify(require('$SCRIPT_DIR/plugin.json').dependencies || [])" 2>/dev/null)

echo ""
echo "==========================================="
echo "  Plugin Build: $PLUGIN_NAME v$PLUGIN_VERSION"
echo "  ID: $PLUGIN_ID"
echo "==========================================="
echo ""

# Private Key finden (fuer Signatur)
SIGNING_PRIVATE_KEY_FILE=""
for SEARCH_DIR in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$SCRIPT_DIR/../.."; do
  if [ -f "$SEARCH_DIR/.signing-key.pem" ]; then
    SIGNING_PRIVATE_KEY_FILE="$SEARCH_DIR/.signing-key.pem"
    break
  fi
done

if [ -z "${UPDATE_SIGNING_PRIVATE_KEY:-}" ] && [ -n "$SIGNING_PRIVATE_KEY_FILE" ] && [ -f "$SIGNING_PRIVATE_KEY_FILE" ]; then
  export UPDATE_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_PRIVATE_KEY_FILE")"
  echo "  [OK] Signing Key gefunden: $SIGNING_PRIVATE_KEY_FILE"
fi

if [ -z "${UPDATE_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "  [!!] WARNUNG: Kein Signing Key gefunden!"
  echo "       Das Plugin wird NICHT signiert."
  echo "       Lege .signing-key.pem in dieses Verzeichnis oder setze UPDATE_SIGNING_PRIVATE_KEY."
  echo ""
fi

# Output-Verzeichnis
OUTPUT_DIR="$SCRIPT_DIR/dist"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Staging-Verzeichnis
STAGING="$OUTPUT_DIR/_staging"
mkdir -p "$STAGING"
cp -R "$SCRIPT_DIR/"* "$STAGING/" 2>/dev/null || true
cp "$SCRIPT_DIR/".[!.]* "$STAGING/" 2>/dev/null || true

# Build-Script und dist nicht mitkopieren
rm -f "$STAGING/build-plugin.sh"
rm -rf "$STAGING/dist"

# TypeScript kompilieren (falls vorhanden)
if [ -d "$STAGING/backend" ]; then
  TS_FILES=()
  while IFS= read -r -d '' f; do
    TS_FILES+=("$f")
  done < <(find "$SCRIPT_DIR/backend" -type f -name '*.ts' -print0)

  if [ ${#TS_FILES[@]} -eq 0 ]; then
    echo "  [OK] Keine TypeScript-Dateien im Backend gefunden"
  else
    TSC_CANDIDATES=(
      "$SCRIPT_DIR/node_modules/.bin/tsc"
      "$SCRIPT_DIR/../node_modules/.bin/tsc"
      "$SCRIPT_DIR/../../node_modules/.bin/tsc"
      "$SCRIPT_DIR/../../backend/node_modules/.bin/tsc"
      "$SCRIPT_DIR/../../frontend/node_modules/.bin/tsc"
    )
    TSC_BIN=""
    for candidate in "${TSC_CANDIDATES[@]}"; do
      if [ -x "$candidate" ]; then
        TSC_BIN="$candidate"
        break
      fi
    done
    if [ -z "$TSC_BIN" ]; then
      TSC_BIN="$(command -v tsc 2>/dev/null || true)"
    fi

    if [ -n "$TSC_BIN" ]; then
      echo "  --> TypeScript kompilieren..."
      BUILD_DIR="$OUTPUT_DIR/_tsc_out"
      mkdir -p "$BUILD_DIR"

      if ! "$TSC_BIN" --outDir "$BUILD_DIR" \
        --module ESNext --target ES2020 --moduleResolution bundler \
        --esModuleInterop true --skipLibCheck true \
        "${TS_FILES[@]}"; then
        echo "  [FEHLER] TypeScript-Kompilierung fehlgeschlagen."
        exit 1
      fi

      if [ -d "$BUILD_DIR/backend" ]; then
        cp -R "$BUILD_DIR/backend/". "$STAGING/backend/"
      fi

      # .ts Dateien entfernen (nur .js ausliefern)
      find "$STAGING/backend" -type f -name '*.ts' -delete

      rm -rf "$BUILD_DIR"
      echo "  [OK] Backend kompiliert"
    else
      echo "  [FEHLER] TypeScript-Dateien gefunden, aber tsc ist nicht verfuegbar."
      exit 1
    fi
  fi
fi

# Manifest anpassen (.ts -> .js Eintraege)
node -e "
const fs = require('fs');
const p = '$STAGING/plugin.json';
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
if (typeof m.backend_entry === 'string' && /\.(ts|tsx)$/i.test(m.backend_entry)) {
  m.backend_entry = m.backend_entry.replace(/\.(ts|tsx)$/i, '.js');
}
if (typeof m.frontend_entry === 'string' && /\.(tsx|ts)$/i.test(m.frontend_entry)) {
  m.frontend_entry = m.frontend_entry.replace(/\.(tsx|ts)$/i, '.js');
}
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
"

# tar.gz erstellen
VERSIONED_TAR="$OUTPUT_DIR/$PLUGIN_ID-$PLUGIN_VERSION.tar.gz"
cd "$STAGING"
tar -czf "$VERSIONED_TAR" .
cp "$VERSIONED_TAR" "$OUTPUT_DIR/latest.tar.gz"
echo "  [OK] $PLUGIN_ID-$PLUGIN_VERSION.tar.gz erstellt"

# version.json erzeugen (mit Hash + optionaler Signatur)
node - "$PLUGIN_ID" "$PLUGIN_VERSION" "$VERSIONED_TAR" "$OUTPUT_DIR/version.json" "$PLUGIN_NAME" "$PLUGIN_DESC" "$PLUGIN_AUTHOR" "$PLUGIN_DEPS" <<'NODE'
const fs = require('fs');
const { createHash, createPrivateKey, sign } = require('crypto');

const [pluginId, version, tarPath, outPath, name, description, author, depsRaw] = process.argv.slice(2);

const tarBuffer = fs.readFileSync(tarPath);
const tarSha256 = createHash('sha256').update(tarBuffer).digest('hex');

const payload = {
  version,
  changelog: `Release v${version}`,
  released_at: new Date().toISOString(),
  artifact_path: `plugins/${pluginId}/${pluginId}-${version}.tar.gz`,
  tar_sha256: tarSha256,
};

if (name) payload.name = name;
if (description) payload.description = description;
if (author) payload.author = author;

try {
  const deps = JSON.parse(depsRaw || '[]');
  if (Array.isArray(deps) && deps.length) payload.dependencies = deps;
} catch {}

// Signierung
const privateKeyRaw = (process.env.UPDATE_SIGNING_PRIVATE_KEY || '').trim();
if (privateKeyRaw) {
  const normalizedKey = privateKeyRaw.replace(/\\n/g, '\n').trim();
  let keyObject;
  if (normalizedKey.includes('BEGIN')) {
    keyObject = createPrivateKey(normalizedKey);
  } else {
    keyObject = createPrivateKey({
      key: Buffer.from(normalizedKey.replace(/\s+/g, ''), 'base64'),
      format: 'der', type: 'pkcs8',
    });
  }
  if (keyObject.asymmetricKeyType !== 'ed25519') {
    throw new Error('Signing Key muss Ed25519 sein');
  }
  const sigPayload = Buffer.from(`mike-update:v1:plugin:${pluginId}:${version}:${tarSha256}`, 'utf8');
  const signature = sign(null, sigPayload, keyObject);
  payload.signature_alg = 'ed25519';
  payload.tar_signature = signature.toString('base64');
  console.log('  [OK] Plugin signiert (Ed25519)');
} else {
  console.log('  [!!] NICHT signiert (kein Private Key)');
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log('  [OK] version.json erstellt');
NODE

# Aufräumen
rm -rf "$STAGING"
cd "$SCRIPT_DIR"

echo ""
echo "==========================================="
echo "  Build fertig!"
echo "==========================================="
echo ""
echo "  Ausgabe in: dist/"
echo "    ├── $PLUGIN_ID-$PLUGIN_VERSION.tar.gz"
echo "    ├── latest.tar.gz"
echo "    └── version.json"
echo ""
echo "  --> Upload nach: plugins/$PLUGIN_ID/"
echo ""
