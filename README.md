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
curl -sSL https://raw.githubusercontent.com/michaelnid/WorkSpace/main/install.sh | sudo bash
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
