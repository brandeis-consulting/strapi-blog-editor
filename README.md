# Brandeis Blog Editor

Schneller Markdown-Editor für Brandeis-Strapi-Blogposts mit pixelgleicher Live-Vorschau. Läuft als Web-Service im Docker-Container.

> **Maintainer:** Lies vor dem ersten Beitrag [`ARCHITECTURE.md`](./ARCHITECTURE.md). Dort sind Anforderungen, Architekturentscheidungen und die Stolpersteine dokumentiert.

## Was die App macht

- Login mit Strapi-Admin-Account (E-Mail + Passwort)
- Liste aller Blogposts, chronologisch nach Jahr/Monat, mit Marker für ungespeicherte Änderungen
- CodeMirror-Markdown-Editor + Live-Preview im exakten Gatsby-Stil
- Buffer pro Post — Wechsel verliert keine Bearbeitung
- Bilder via `Strg+V` aus der Zwischenablage einfügen → automatischer Strapi-Upload + Markdown-Link
- Diff-Highlights für geänderte Wörter in der Vorschau (toggle)
- Trennung von „Nur Entwurf speichern" und „Veröffentlichen"
- Neue Posts anlegen (Titel + Slug + Content)
- Scroll-Sync zwischen Editor und Preview, resizable Panels

## Entwicklung (lokal)

```powershell
cd "C:\Users\micro\Google Drive\Claude Code\strapi-blog-editor"
npm install
npm run dev
```

Vite läuft auf 5173, Express-API auf 3000 (parallel via `concurrently`). Browser: <http://localhost:5173>, Login mit Strapi-Account.

Optional `.env` (siehe `.env.example`) für eine alternative Strapi-URL.

## Produktion (Docker, für Portainer)

### Architektur

Zwei Stacks, sauber getrennt:

```
caddy-config (eigenes Repo)        strapi-blog-editor (dieses Repo)
├── Caddyfile                       ├── Dockerfile
└── docker-compose.yml              └── docker-compose.yml
        │                                    │
        ▼                                    ▼
┌──────────────┐    Docker-Netzwerk    ┌──────────────────┐
│    Caddy     │ ←─── "caddy" ────→   │  blog-editor     │
│ :80, :443    │                       │  :3000 (intern)  │
└──────────────┘                       └──────────────────┘
        │
        ▼ Let's Encrypt
   Internet
```

Caddy läuft als zentraler Reverse-Proxy für alle Web-Apps auf dem Host (siehe Repo `caddy-config`). Der blog-editor klinkt sich nur in das externe `caddy`-Netzwerk ein.

### Voraussetzung: Caddy-Stack läuft

Vor dem ersten Deploy muss der zentrale Caddy-Stack einmalig aufgesetzt sein. Anleitung siehe `caddy-config/README.md`. Im Caddyfile muss ein Block für diese App existieren:

```caddyfile
blog-editor.brandeis.de {
    reverse_proxy blog-editor:3000
    encode gzip
}
```

Der DNS-A-Record für die Subdomain muss bereits auf den Server zeigen.

### Stack in Portainer anlegen

**Stacks → Add stack → Repository**:

| Feld                 | Wert                                                |
| -------------------- | --------------------------------------------------- |
| Name                 | `blog-editor`                                       |
| Repository URL       | `https://github.com/<user>/strapi-blog-editor.git`  |
| Repository reference | `refs/heads/main`                                   |
| Compose path         | `docker-compose.yml`                                |

**„Deploy the stack"** — Portainer baut das Image aus dem Dockerfile und startet den Container im `caddy`-Netzwerk.

### Lokal bauen und testen

```powershell
docker build -t brandeis/blog-editor:latest .
docker run --rm -p 8080:3000 -e STRAPI_URL=https://cms.brandeis.de brandeis/blog-editor:latest
# → http://localhost:8080
```

### Updates ausrollen

1. Code-Änderung committen + pushen
2. Portainer → `blog-editor`-Stack → Editor-Tab → **„Pull and redeploy"** → ✅ **„Re-pull image and redeploy"**

→ Portainer holt den neusten Commit, baut das Image neu, ersetzt den Container. Caddy bleibt unangefasst.

### Env-Variablen

| Variable     | Default                   | Beschreibung                                  |
| ------------ | ------------------------- | --------------------------------------------- |
| `STRAPI_URL` | `https://cms.brandeis.de` | Strapi-Base-URL                               |
| `PORT`       | `3000`                    | Server-Listen-Port (in der Regel nie ändern)  |
| `NODE_ENV`   | –                         | Auf `production` setzen für `Secure`-Cookies  |

## Sicherheit

- Login proxiet zu Strapi `/admin/login`; JWT bleibt im Server
- JWT wird im Browser nur als `HttpOnly`-Cookie gespeichert (`SameSite=Strict`, in Production `Secure`)
- Helmet setzt CSP, X-Frame-Options usw.
- Voraussetzung pro Kollege: bestehender Strapi-Admin-Account

## Tastaturkürzel

- `Strg+S` — Speichern-Dialog öffnen
- `Strg+B` — Sidebar ein-/ausblenden
- `Strg+N` — Neuen Post anlegen
- `Strg+V` (im Editor) — Bild aus Zwischenablage einfügen → wird hochgeladen

## Gatsby-Synchronität

Vorschau-Styling und Markdown-Pipeline kommen direkt aus dem Gatsby-Repo. Bei größeren Style-Änderungen im Gatsby: Dateien neu rüberkopieren — siehe Liste in `src/styles/gatsby/` und `src/render/highlight-langs/`. Details im [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Bekannte Einschränkungen

- Categorienames werden als Slugs angezeigt, nicht als lokalisierte Labels
- Keine Multi-User-Awareness (zwei Kollegen am gleichen Post → letzte Speicherung gewinnt)
