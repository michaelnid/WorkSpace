# MIKE WorkSpace

Modulares Enterprise-Framework mit Plugin-System, Multi-Tenancy und rollenbasierter Zugriffskontrolle.

## Techstack

| Komponente | Technologie |
|---|---|
| Backend | Node.js 20, Fastify 5, TypeScript |
| Frontend | React 19, Vite 6, TypeScript |
| Datenbank | MariaDB 10.11+ |
| Auth | JWT (Access + Refresh), MFA (TOTP) |
| Webserver | Nginx (Reverse Proxy) |
| Prozess | systemd |

## Mindest-Serveranforderungen

| Ressource | Minimum |
|---|---|
| RAM | 1 GB |
| vCPU | 1 |
| Disk | 10 GB |
| OS | Debian 12 |
| Ports | 80 (HTTP), 443 (HTTPS), 22 (SSH) |

## Plesk Git kompatibel

Nein

## Installation

```bash
INSTALL_URL="https://raw.githubusercontent.com/michaelnid/WorkSpace/04ac4cc6f06808a6d496d9198f4dc2700bde4847/install.sh"
INSTALL_SHA256="153ace65d13da3c3ad046d712b4159ac35d6da08639f5a87fdc6555616280938"
curl -fSLo install.sh "$INSTALL_URL"
echo "$INSTALL_SHA256  install.sh" | sha256sum -c -
sudo bash install.sh
```

Oder lokal:

```bash
sudo bash install.sh
```

Der Installer fuehrt interaktiv durch alle Schritte: Pakete, Node.js, MariaDB, Nginx, SSL (Let's Encrypt), systemd-Service.

## Dev Update (SSH)

Neusten Stand von GitHub holen und deployen (unabhaengig von Versionsnummern):

```bash
sudo bash /opt/mike-workspace/update.sh
```
