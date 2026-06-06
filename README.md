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

### Docker-Image bauen

```powershell
docker build -t brandeis/blog-editor:latest .
docker run -p 8080:3000 -e STRAPI_URL=https://cms.brandeis.de brandeis/blog-editor:latest
```

### Portainer-Stack

In Portainer → **Stacks → Add stack → Web editor** und folgendes einfügen:

```yaml
services:
  blog-editor:
    build: .
    image: brandeis/blog-editor:latest
    container_name: brandeis-blog-editor
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      NODE_ENV: production
      STRAPI_URL: https://cms.brandeis.de
      PORT: 3000
    networks:
      - proxy

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    networks:
      - proxy
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    command: caddy reverse-proxy --from blog-editor.brandeis.de --to http://blog-editor:3000
    depends_on:
      - blog-editor

networks:
  proxy:

volumes:
  caddy_data:
  caddy_config:
```

- Domain (`blog-editor.brandeis.de`) gegen die echte Subdomain ersetzen
- DNS-A-Record muss bereits auf den Server zeigen, bevor der Stack startet
- Caddy holt automatisch ein Let's-Encrypt-Zertifikat

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
