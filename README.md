# Brandeis Blog Editor

Schneller Markdown-Editor für Brandeis-Strapi-Blogposts mit pixelgleicher Live-Vorschau. Verfügbar als Electron-Desktop-App **und** als Docker-Web-Service (gleiche Codebase).

> **Maintainer:** Lies vor dem ersten Beitrag [`ARCHITECTURE.md`](./ARCHITECTURE.md). Dort sind Anforderungen, Architekturentscheidungen und die Stolpersteine dokumentiert, die mich bei der Implementierung Zeit gekostet haben.

## Was die App macht

- Login mit Strapi-Account (E-Mail/Username + Passwort)
- Liste aller Blogposts, chronologisch nach Jahr/Monat
- CodeMirror-Markdown-Editor + Live-Preview im exakten Gatsby-Stil
- Scroll-Sync zwischen Editor und Preview
- Resizable / kollabierbare Sidebar
- Publish per Diff-Dialog (zeigt Zeilen-Änderungen vor dem Speichern)

## Architektur

```
electron/
├── main.ts        # Electron Main-Process, IPC, .env-Loader
├── preload.ts     # contextBridge → window.strapi, window.auth
├── auth.ts        # AuthService (Strapi JWT via /api/auth/local, safeStorage-persistiert)
└── strapi.ts      # GraphQL-Client (JWT-basiert)

src/
├── App.tsx                    # Auth-Gate (Login vs. AppShell)
├── AppShell.tsx               # Hauptlayout
├── api/{strapi,auth}.ts       # IPC-Wrapper
├── components/
│   ├── Login.tsx
│   ├── PostList.tsx           # Sidebar, Jahres-/Monatsgruppierung
│   ├── Editor.tsx             # CodeMirror 6
│   ├── Preview.tsx            # 1:1 Gatsby-Layout
│   └── PublishDialog.tsx      # Diff-Anzeige
├── render/
│   ├── Markdown.tsx           # exakt eure Gatsby-Pipeline
│   └── highlight-langs/       # abap/cds/bdl aus Gatsby
├── hooks/{usePosts,useAuth,useDebounced,useScrollSync}.ts
└── styles/gatsby/             # SCSS 1:1 aus Gatsby (globalStyles, blogLayout, content_style)
```

## Sicherheit

- Strapi-JWT bleibt im Electron-Main-Process; Renderer hat über IPC keinen Direktzugriff
- Persistenz via Electron `safeStorage` → Windows DPAPI (nur dieser OS-User auf diesem PC kann entschlüsseln)
- Bei 401-Response wird die Session automatisch ungültig gesetzt → Login-Screen

## Entwicklung

```powershell
cd "C:\Users\micro\Google Drive\Claude Code\strapi-blog-editor"
npm install
npm run dev
```

Optional `.env` (siehe `.env.example`) für eine alternative Strapi-URL.

## Web-Version (Docker, für Portainer)

Alternativ zur Electron-App kannst du die identische App als Web-Service betreiben — gleiche Codebase, gleiches UI, kein Software-Rollout.

### Lokal testen

```powershell
npm install
npm run dev:web        # startet Vite (5173) + Express-API (3000) parallel
```

Im Browser http://localhost:5173 öffnen. Login mit Strapi-Admin-Account.

### Docker-Image bauen

```powershell
docker build -t brandeis/blog-editor:latest .
docker run -p 8080:3000 -e STRAPI_URL=https://cms.brandeis.de brandeis/blog-editor:latest
```

### Portainer-Deployment

In Portainer → **Stacks → Add stack → Web editor** und folgendes einfügen:

```yaml
services:
  blog-editor:
    build: .
    image: brandeis/blog-editor:latest
    container_name: brandeis-blog-editor
    restart: unless-stopped
    environment:
      NODE_ENV: production
      STRAPI_URL: https://cms.brandeis.de
      PORT: 3000
    ports:
      - "8080:3000"
```

Falls du das Repository per Git verbindest, kannst du auch das mitgelieferte `docker-compose.yml` direkt verwenden.

### Reverse-Proxy + HTTPS

Im Internet erreichbar machen via Traefik / Caddy / nginx:

- **Traefik-Label** auf dem Container hinzufügen für automatische LetsEncrypt-Zertifikate
- App selbst läuft auf Port `3000` im Container, intern unverschlüsselt — die HTTPS-Terminierung übernimmt der Reverse-Proxy

**Sicherheit:**
- Das Session-Cookie ist `HttpOnly` + `SameSite=Strict`. Bei `NODE_ENV=production` zusätzlich `Secure` → läuft nur über HTTPS. Das ist Pflicht im Internet.
- JWT verlässt nie den Browser im Klartext (nicht im `localStorage`, nicht in `sessionStorage`).
- Helmet setzt CSP, X-Frame-Options, etc.
- Voraussetzung pro Kollege: bestehender Strapi-Admin-Account (gleicher wie für Strapi-Admin-Panel).

### Env-Variablen

| Variable | Default | Beschreibung |
|---|---|---|
| `STRAPI_URL` | `https://cms.brandeis.de` | Strapi-Base-URL |
| `PORT` | `3000` | Server-Listen-Port |
| `NODE_ENV` | – | Auf `production` setzen für `Secure`-Cookies |

## Distribution an Kollegen

### 1. Voraussetzung pro Kollege

Im Strapi-Admin → **Settings → Users & Permissions → Users** muss ein Account existieren, dessen Rolle `find / findOne / update` auf `ba-blog-post` (und die verknüpften Content-Types wie `ba-blog-category`, Upload-Plugin, etc.) erlaubt.

### 2. Build erstellen

```powershell
# beides bauen (NSIS-Installer + portable .exe)
npm run dist

# nur Installer
npm run dist:installer

# nur portable
npm run dist:portable
```

Output landet in `dist-build/`:
- `Brandeis-Blog-Editor-Setup-<version>.exe` — klassischer Installer
- `Brandeis-Blog-Editor-<version>-portable.exe` — eine einzelne `.exe` zum Verteilen

### 3. Verteilen

- **Installer-Version:** Kollegen führen die `.exe` aus → Setup-Wizard → App in `Programme`, Desktop- und Startmenü-Verknüpfung
- **Portable-Version:** Kollegen kopieren die `.exe` irgendwohin und starten per Doppelklick
- Beim ersten Start: Login mit Strapi-Account, JWT wird verschlüsselt auf dem PC gespeichert
- Bei jedem weiteren Start: direkt in der App (Session bleibt ~30 Tage gültig, abhängig von Strapi-Config)

### 4. Updates

Du baust eine neue Version (Version in `package.json` hochzählen) und schickst die neue `.exe`. Code-Signing und Auto-Updates sind möglich (`electron-updater` + GitHub Releases), aktuell nicht aktiviert.

## Gatsby-Synchronität

Vorschau-Styling und Markdown-Pipeline kommen direkt aus dem Gatsby-Repo. Bei größeren Style-Änderungen im Gatsby: Dateien neu rüberkopieren — siehe Liste in `src/styles/gatsby/` und `src/render/highlight-langs/`.

## Tastaturkürzel

- `Strg+S` — Veröffentlichen-Dialog öffnen
- `Strg+B` — Sidebar ein-/ausblenden
- `Strg+R` (DevTools) — Renderer neu laden (nur Dev-Modus)

## Bekannte Einschränkungen

- Bilder-Upload aus dem Editor heraus ist nicht implementiert (Bilder im Markdown brauchen weiterhin den manuellen Upload über Strapi-Admin)
- Categorienames werden als Slugs angezeigt, nicht als lokalisierte Labels
- Keine Auto-Updates (manuelles Verteilen neuer Builds)
