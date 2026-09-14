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

```
GitHub (push auf main)
   │
   ▼ .github/workflows/build.yml
┌──────────────────────┐
│  Typprüfung → Image  │
│  → ghcr.io           │  ghcr.io/brandeis-consulting/blog-editor:latest
└──────────────────────┘
   │
   ▼ POST auf den Portainer-Stack-Webhook
┌────────────────────────────────────────────────────┐
│  files.brandeis.de                                 │
│                                                    │
│  Caddy (Host-Prozess, :80/:443)                    │
│     └── blog-editor.brandeis.de → localhost:3003   │
│                                                    │
│  Docker: brandeis-blog-editor                      │
│     127.0.0.1:3003 → :3000 im Container            │
└────────────────────────────────────────────────────┘
```

**Zwei Dinge, die anders sind als bei einem üblichen Portainer-Setup** — beide haben ihren Grund auf diesem Server:

1. **Das Image wird in der CI gebaut, nicht auf dem Server.** files.brandeis.de hat 1,9 GB RAM, von denen im Betrieb keine 800 MB frei sind; der Vite-Build verlangt allein 2 GB Heap. Ein `build: .` im Compose würde dort scheitern oder den OOM-Killer auf CRM, Hub und die Zipline-Postgres hetzen, die auf derselben Maschine laufen.
2. **Caddy läuft als Host-Prozess, nicht als Container.** Es kann Docker-DNS deshalb nicht auflösen und erreicht Dienste nur über `localhost:<port>`. Ein externes `caddy`-Docker-Netzwerk (wie es frühere Fassungen dieser Datei vorsahen) nützt hier nichts — der Container veröffentlicht stattdessen auf `127.0.0.1:3003`, so wie crm (8080), hub (3002) und zipline (3000).

### Einmalig einzurichten

**1. Caddy-Block** in `/etc/caddy/Caddyfile` auf files.brandeis.de:

```caddyfile
blog-editor.brandeis.de {
	encode zstd gzip
	reverse_proxy localhost:3003
}
```

Danach `caddy validate --config /etc/caddy/Caddyfile` und `systemctl reload caddy`.

**2. Portainer-Stack** (Stacks → Add stack → Repository), Name `blog-editor`, Compose-Pfad `docker-compose.yml`. Das ghcr-Paket ist privat — die Registry-Zugangsdaten sind in Portainer bereits hinterlegt (crm und hub nutzen dieselben).

**3. Webhook als GitHub-Secret.** Im Stack die Webhook-URL kopieren und unter Settings → Secrets and variables → Actions als `PORTAINER_WEBHOOK_BLOG_EDITOR` hinterlegen.

⚠️ **Das Pfad-Präfix fehlt in der kopierten URL.** Portainer läuft hinter Caddy unter `/portainer` und weiß nichts davon; die angezeigte URL entsteht aus der Browser-Adresse. Richtig ist:

```
https://files.brandeis.de/portainer/api/stacks/webhooks/<uuid>
```

Ohne `/portainer` landet der Aufruf beim Catch-all der Domain (zipline) — der antwortet **ebenfalls** mit 404, unterscheidbar nur am Text. Ist das Secret nicht gesetzt, baut die CI das Image trotzdem und weist in der Zusammenfassung darauf hin; der Stack bleibt dann auf dem alten Stand.

**4. DNS.** `blog-editor.brandeis.de` ist ein A-Record in Netlify DNS. Er muss auf `212.227.208.67` zeigen. Caddy holt das Let's-Encrypt-Zertifikat erst, **nachdem** der Record umgestellt ist (HTTP-01 verlangt, dass der Name bereits hierher zeigt) — zwischen Umstellung und erstem Zugriff liegt ein kurzes Loch.

### Updates ausrollen

`git push` auf `main` — mehr nicht. Die Action prüft Typen, baut das Image, schiebt es nach ghcr und stößt den Stack an.

Von Hand geht es in Portainer über **„Update the stack"** mit gesetztem Häkchen **„Re-pull image"**. Ohne das Häkchen kommt der alte Stand wieder hoch.

### Lokal bauen und testen

```powershell
docker build -t brandeis/blog-editor:latest .
docker run --rm -p 8080:3000 -e STRAPI_URL=https://cms.brandeis.de brandeis/blog-editor:latest
# → http://localhost:8080
```

### Env-Variablen

| Variable     | Default                   | Beschreibung                                  |
| ------------ | ------------------------- | --------------------------------------------- |
| `STRAPI_URL` | `https://cms.brandeis.de` | Strapi-Base-URL                               |
| `PORT`       | `3000`                    | Server-Listen-Port (in der Regel nie ändern)  |
| `NODE_ENV`   | –                         | Auf `production` setzen für `Secure`-Cookies  |
| `PREVIEW_URL`| `https://www.brandeis.de/blog-preview/` | Vorschauseite im Gatsby-Projekt. Wird als iframe eingebettet; ihr Origin landet automatisch in der CSP (`frame-src`). Lokal: `http://localhost:8000/blog-preview/` |
| `UPLOAD_FOLDER_ID` | –                   | Strapi-Medienordner für eingefügte Bilder     |

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

**Es gibt nichts zu synchronisieren.** Die Vorschau ist ein iframe auf `/blog-preview` der Live-Site und rendert dort dieselben Komponenten wie eine echte Blogseite — Styling und Markdown-Pipeline können deshalb gar nicht auseinanderlaufen. Früher lagen Kopien in `src/styles/gatsby/` und `src/render/`; sie sind entfallen.

Zwei Kopplungen bleiben und müssen zusammenpassen:

| Was | Wo |
| --- | --- |
| Erlaubte Einbettung | `frame-ancestors` in `brandeis-academy/static/_headers` muss `https://blog-editor.brandeis.de` enthalten |
| Beitragsstruktur | Liest ein Template-Rumpf ein neues Feld, muss `src/lib/previewPayload.ts` es mitschicken |

Details in [`ARCHITECTURE.md`](./ARCHITECTURE.md) (ADR-014) und `brandeis-academy/docs/blog-editor-vorschau.md`.

## Bekannte Einschränkungen

- Categorienames werden als Slugs angezeigt, nicht als lokalisierte Labels
- Keine Multi-User-Awareness (zwei Kollegen am gleichen Post → letzte Speicherung gewinnt)
