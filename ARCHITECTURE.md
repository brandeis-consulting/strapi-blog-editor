# Architektur, Entscheidungen und Lessons Learned

Dieses Dokument richtet sich an Maintainer, die das Projekt übernehmen oder weiterentwickeln. Es beantwortet drei Fragen:

1. **Was sollte das Tool können?** → [Anforderungen](#anforderungen)
2. **Wie ist es gebaut?** → [Architektur](#architektur)
3. **Warum wurde es so gebaut?** → [Architekturentscheidungen](#architekturentscheidungen-adrs)
4. **Was würde mich beim Weiterarbeiten überraschen?** → [Lessons Learned](#lessons-learned)

---

## Anforderungen

Entstanden iterativ während der Entwicklung. In ungefährer Implementierungsreihenfolge:

### Kernfunktionen (MVP)
- Blogposts aus Strapi CMS (`cms.brandeis.de`) laden
- Liste aller Posts, **chronologisch sortiert, gruppiert nach Jahr und Monat**
- Markdown im Editor anzeigen und bearbeiten
- **Live-Preview** im gleichen visuellen Stil wie die Live-Site (`brandeis.de/blog/...`)
- Änderungen zurück ins CMS speichern können
- Hintergrund: Gatsby-Site rebuildet ~5 Minuten pro Änderung. Tool soll Iteration auf Sekunden bringen.

### Erweiterte UX
- Editor und Preview **separat scrollbar**
- **Optionaler Scroll-Sync** zwischen beiden (proportional)
- Sidebar **ausblendbar / kollabierbar**
- Panelbreiten **per Drag resizable**, Layout-State persistiert (über `react-resizable-panels` `autoSaveId`)
- **Geänderte Wörter in der Preview hervorheben** (Diff-Visualisierung, toggle-bar)
- **Buffer pro Post**: Wechsel zwischen Posts verliert keine ungespeicherten Änderungen
- **Marker in der Liste** für Posts mit unsaved changes
- **Verwerfen-Button** zum Zurücksetzen eines Drafts auf den Server-Stand
- **App-Branding** mit Brandeis-Logo

### Inhalte & Workflow
- **Neuen Post anlegen** (Title + Slug + leerer Content)
- **Save vs. Publish trennen**: Nur Draft oder Draft + Live veröffentlichen
- **Diff-Dialog** vor jedem Save zeigt zeilenweise +/− Änderungen
- **Veröffentlichen ohne Änderungen** möglich (für nachträgliches Publish eines gespeicherten Drafts)

### Distribution
- **Electron-Desktop-App** mit NSIS-Installer + portabler `.exe` für Windows
- **Web-Variante** als Docker-Container für Portainer-Deployment, gleiche Codebase
- Beide Varianten parallel pflegbar

### Auth & Sicherheit
- Login mit **Strapi-Admin-Account** (jeder Kollege hat ohnehin einen für das Admin-Panel)
- Identitäts-Tracking pro Kollege (kein shared Token)
- JWT verschlüsselt persistieren (Electron: `safeStorage`, Web: `HttpOnly`-Cookie)
- Bei Session-Ablauf automatisch zurück zum Login

---

## Architektur

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + TypeScript)                          │
│                                                                 │
│  src/                                                           │
│  ├── App.tsx              Auth-Gate                            │
│  ├── AppShell.tsx         Hauptlayout, States, Handlers        │
│  ├── api/                 Strapi-Client (mode-aware)           │
│  ├── components/          Login, PostList, Editor, Preview, …  │
│  ├── hooks/               useAuth, usePosts, useScrollSync, …  │
│  ├── render/              react-markdown-Pipeline aus Gatsby   │
│  └── styles/gatsby/       SCSS 1:1 aus Gatsby-Repo kopiert     │
│                                                                 │
│  Mode-Switch via __APP_MODE__ (define im Vite-Build):           │
│    "electron"  → window.strapi / window.auth (IPC)             │
│    "web"       → fetch("/api/...") mit credentials: "include"  │
└────────────────────────────────────────────────────────────────┘
              │                                  │
              ▼ IPC                              ▼ HTTP (Cookie)
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  Electron Main Process       │   │  Express Server              │
│  electron/                   │   │  server/                     │
│  ├── main.ts (IPC handlers)  │   │  ├── index.ts                │
│  ├── preload.ts (bridge)     │   │  ├── routes/auth.ts          │
│  ├── auth.ts (safeStorage)   │   │  ├── routes/posts.ts         │
│  └── strapi.ts (REST client) │   │  ├── middleware/auth.ts      │
│                              │   │  └── lib/strapi.ts (kopiert) │
└──────────────────────────────┘   └──────────────────────────────┘
              │                                  │
              └─────────────────┬────────────────┘
                                ▼
              ┌────────────────────────────────────────┐
              │  Strapi v5  (cms.brandeis.de)         │
              │                                        │
              │  POST /admin/login                    │
              │  GET  /admin/users/me                 │
              │  GET  /content-manager/collection-     │
              │       types/api::ba-blog-post...      │
              │  PUT  .../<documentId>                │
              │  POST .../<documentId>/actions/publish│
              │  POST .../create                      │
              └────────────────────────────────────────┘
```

### Modi und Build-Targets

| Modus | Build-Command | Auth-Persistenz | Distribution |
|---|---|---|---|
| Electron Dev | `npm run dev` | `safeStorage` (DPAPI) | – |
| Electron Build | `npm run dist` | – | NSIS + portable `.exe` |
| Web Dev | `npm run dev:web` | `HttpOnly`-Cookie | – |
| Web Build | `npm run build:web` | – | – |
| Web Production | `docker build .` | `HttpOnly`-Cookie + `Secure` | Docker-Container |

### Gemeinsamer Code

- `electron/strapi.ts` und `server/lib/strapi.ts` enthalten **dieselbe StrapiClient-Klasse**. Aktuell durch File-Copy synchron gehalten — siehe [ADR-007](#adr-007-strapi-client-dupliziert-statt-zentralisiert).
- Frontend (`src/`) wird in beiden Modi unverändert verwendet.

### Datenfluss beim Speichern

1. User editiert Markdown im CodeMirror → `handleDraftChange(value)` updated `buffers.get(documentId).draft`
2. `Strg+S` oder Button öffnet `PublishDialog` mit Zeilen-Diff
3. User wählt „Nur Entwurf speichern" oder „Speichern & veröffentlichen"
4. **Save-Logik:**
   - Wenn dirty: `PUT /content-manager/collection-types/<uid>/<id>` mit `{ Content }`
   - Wenn Modus=publish: zusätzlich `POST .../actions/publish`
   - Response (PostDetail) ersetzt den Buffer-Eintrag, dirty wird false

### Buffer-System

`AppShell` hält `Map<documentId, { detail: PostDetail; draft: string }>`. Vorteile:
- Wechsel zwischen Posts verliert keine ungespeicherten Änderungen
- Cache: bereits geladene Posts werden nicht erneut vom Server geholt
- `dirtyIds = Set<id>` wird daraus per `useMemo` abgeleitet

Buffer leben nur im Arbeitsspeicher. App-Restart leert sie — bewusst, siehe [ADR-005](#adr-005-buffer-nur-im-memory-keine-localstorage-persistenz).

---

## Architekturentscheidungen (ADRs)

### ADR-001: Hybrid Electron + Web aus einer Codebase

**Status:** akzeptiert

**Kontext:** Erst war Electron das Ziel, später kam Docker dazu.

**Entscheidung:** Beide Varianten parallel pflegen. `__APP_MODE__` ist ein Vite-`define` und wird zur Build-Zeit zu `"electron"` oder `"web"` ersetzt. Im Frontend gibt es genau zwei kleine Switches in `src/api/strapi.ts` und `src/api/auth.ts`.

**Konsequenzen:**
- ✓ Frontend-Code ist identisch in beiden Varianten
- ✓ Backend-Logik (StrapiClient) wird einmal geschrieben, in beide Wrapper integriert
- ✗ Doppelte Code-Pfade bei `dist` und `build:web`
- ✗ Wer Tests schreibt, muss beide Modi abdecken

### ADR-002: Strapi-Admin-Login statt /api/auth/local

**Status:** akzeptiert

**Kontext:** Strapi v5 hat **zwei separate User-Systeme**:
- Admin Users (Strapi-Admin-Panel) → `POST /admin/login`
- End Users (`users-permissions`-Plugin) → `POST /api/auth/local`

Die Editoren haben ohnehin Admin-Accounts (sie pflegen Inhalte im Admin-Panel). End-User-Accounts wären eine zweite Identität pro Person.

**Entscheidung:** `/admin/login` verwenden. Keine Doppelpflege.

**Konsequenzen:**
- ✓ Kollegen brauchen keinen extra Account
- ✓ Strapi protokolliert `updatedBy`/`createdBy` automatisch
- ✗ Admin-JWT funktioniert **nicht** für `/api/...` oder `/graphql` — siehe ADR-003

### ADR-003: Content-Manager-REST-API statt GraphQL

**Status:** akzeptiert

**Kontext:** Erste Implementierung nutzte `POST /graphql`. Nach Umstellung auf Admin-JWT lieferte GraphQL aber `Forbidden access`. Strapi unterscheidet die APIs:

| API | Auth | Verwendung |
|---|---|---|
| `/api/...` | API-Token, End-User-JWT | Public/Frontend (Gatsby) |
| `/graphql` | API-Token, End-User-JWT | Public/Frontend (Gatsby) |
| `/content-manager/...` | Admin-JWT | Strapi-Admin-Panel |

**Entscheidung:** `/content-manager/collection-types/api::ba-blog-post.ba-blog-post` benutzen. Funktioniert mit Admin-JWT.

**Konsequenzen:**
- ✓ Admin-JWT passt
- ✗ API-Format ist anders (`{ results, pagination }` statt `{ data, meta }`)
- ✗ Strapi v5 draft & publish: PUT updated nur Draft, separater `POST .../actions/publish` für live

### ADR-004: SCSS und Highlight-Sprachen aus Gatsby kopieren (statt nachbauen)

**Status:** akzeptiert mit bekanntem Risiko

**Kontext:** Die Vorschau soll **pixelgleich** zur Live-Site sein. Gatsby-Repo nutzt:
- `globalStyles.scss` (1164 Zeilen, alle Custom-Klassen wie `.info-box`, `.cs-*`, `.col`, …)
- `blogLayout.module.scss` (Blog-Layout)
- `content_style.module.scss` (Markdown-Default-Styles)
- `globalDefinitions.scss` (Variables/Mixins)
- `highlight.js`-Sprachen für ABAP, CDS, BDL

**Entscheidung:** Diese Files **unverändert** ins Projekt kopieren (`src/styles/gatsby/`, `src/render/highlight-langs/`). Markdown-Pipeline (`react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-raw`) ist 1:1 aus `gatsby-source/src/components/markdown.js`.

**Konsequenzen:**
- ✓ Visuelle Konsistenz
- ✓ Schnell implementiert
- ✗ **Drift-Risiko**: ändert sich im Gatsby-Repo etwas, merkt der Editor nichts
- ✗ Sync ist manuell (siehe `scripts/sync-gatsby.mjs` — falls noch nicht angelegt)

### ADR-005: Buffer nur im Memory, keine localStorage-Persistenz

**Status:** akzeptiert

**Kontext:** Der Buffer (`Map<documentId, { detail, draft }>`) hält ungespeicherte Änderungen. Beim App-Restart gehen sie verloren.

**Entscheidung:** Bewusst keine `localStorage`-/`sessionStorage`-Persistenz.

**Begründung:**
- Drafts, die Tage oder Wochen alt sind, verwirren mehr als sie helfen
- Strapi v5 hat ohnehin draft & publish — User soll explizit speichern
- Risiko von „verlorenen" Drafts beim App-Switch ist gering, weil der User in der Regel innerhalb einer Session arbeitet

**Bei Änderung:** Wenn Persistenz gewünscht, in `useAuth`-Hook (für Web mit Cookie) oder direkt in `AppShell` ergänzen. Achtung: bei Strapi-seitigen Updates am Original-Content sollten persistente Buffers invalidiert werden — sonst überschreibt der User unbeabsichtigt fremde Änderungen.

### ADR-006: react-resizable-panels v2, nicht v4

**Status:** akzeptiert

**Kontext:** v4.x dieser Library hat eine komplett andere API (`Group`/`Separator` statt `PanelGroup`/`PanelResizeHandle`). Initial wurde v4 installiert, war undokumentiert und brachte den Renderer zum Crash.

**Entscheidung:** Auf `^2` pinnen in `package.json`.

**Bei Update:** v2 ist Maintenance-Mode. v3 ist API-kompatibel. v4 würde Refactor des `PanelGroup`-Setups bedeuten — nicht ohne Grund machen.

### ADR-007: Strapi-Client dupliziert statt zentralisiert

**Status:** akzeptiert mit Folgekosten

**Kontext:** `electron/strapi.ts` und `server/lib/strapi.ts` enthalten identischen Code.

**Entscheidung:** Vorerst File-Copy. Eine zentrale `shared/strapi.ts` würde:
- vite-plugin-electron-Bundling komplizieren
- tsconfig-Pfade in beiden Konsumenten anpassen

**Bei späterem Refactor:** `shared/` Ordner, beide tsconfig.* erweitern, ggf. mit pnpm/turbo Workspaces.

### ADR-008: JWT via HttpOnly-Cookie (Web), nicht localStorage

**Status:** akzeptiert

**Kontext:** Web-Variante braucht einen Persistenz-Mechanismus für das JWT.

**Entscheidung:** Server setzt JWT in `HttpOnly`-Cookie mit `SameSite=Strict`, in Production zusätzlich `Secure`.

**Begründung:**
- XSS-sicher (JS kann das Cookie nicht lesen)
- Automatisch bei jedem Request mitgesendet
- Logout = Cookie löschen, kein Frontend-State-Management

### ADR-009: electron-builder 24.13.3, nicht 26

**Status:** akzeptiert als Workaround

**Kontext:** electron-builder 26 hat einen bekannten Bug mit `@noble/hashes` ESM-Exports. Build crasht mit `ERR_REQUIRE_ESM`.

**Entscheidung:** Pinning auf `24.13.3`.

**Bei Update:** Vor einem Update auf v26.x testen, ob der Bug behoben ist (oder ob ein `overrides`-Eintrag genügt).

### ADR-010: Diff-Highlight als `<mark>` im Markdown-Source

**Status:** akzeptiert

**Kontext:** Geänderte Wörter sollen in der Preview sichtbar sein.

**Entscheidung:** `diffWords(original, draft)` liefert Chunks, Added-Chunks werden in `<mark class="diff-added">…</mark>` eingewickelt — direkt im Markdown-String vor dem Rendering. `rehype-raw` lässt das durch.

**Begründung:** Pragmatisch, kein Custom-Plugin nötig.

**Bekannte Grenzen:**
- `<mark>` mitten in Inline-Konstrukten (`[link](url)`, `**bold**`) kann Layout brechen
- Code-Fences werden explizit gestrippt (`stripMarksInsideCodeFences`)
- Removed-Words werden nicht angezeigt (würde Preview-Länge verändern)

---

## Lessons Learned

Konkrete Stolpersteine, die mich Zeit gekostet haben — damit dich dieselben nicht überraschen.

### Strapi-Quirks

1. **Zwei User-Systeme**: Admin Users ≠ End Users. Admin-JWT funktioniert **nicht** für `/api/...` oder `/graphql`, nur für `/content-manager/...` und `/admin/...`. Wenn Login klappt aber Datenabruf nicht → vermutlich falsche API.

2. **Token-Permissions sind feingranular**: Ein API-Token mit `find` auf `ba-blog-post` reicht **nicht**, wenn der Post Relations (HeroImage, Author, Categories) hat. Diese Content-Types brauchen ebenfalls explizite Permissions, sonst `Forbidden access` für den ganzen Document-Aufruf — nicht nur für die Relation.

3. **Content-Type-Builder ist nur Admin**: Der Endpoint `/api/content-type-builder/content-types` liefert 403 mit API-Tokens. Schema ableiten geht über die Gatsby-Source-Config (`gatsby-config.js` → `collectionTypes` mit `populate`-Definitionen) oder über die tatsächliche Response.

4. **Strapi v5 draft & publish**: `PUT /content-manager/.../<id>` aktualisiert nur den Draft. Damit es live auf der Gatsby-Site erscheint, **zusätzlich** `POST /actions/publish` aufrufen. Wir trennen das im Frontend bewusst in zwei Buttons.

5. **documentId statt id**: In Strapi v5 wird der externe Identifier `documentId` genannt. In GraphQL: `filters: { documentId: { eq: "..." } }`. In Content-Manager-URLs: `/content-manager/collection-types/<uid>/<documentId>`. Verwechsle das nicht mit der internen DB-`id`.

### Vite / Build-Toolchain

6. **CSS-Modules brauchen `localsConvention`**: Gatsby benutzt camelCase-Lookup (`Styles.blogPost` → `.blog-post`-Klasse). Vite-Default ist beides (kebab + camel), aber inkonsistent. Wir setzen `localsConvention: "camelCaseOnly"`.

7. **SCSS-Module mit `:global()`**: `@use "x" as *` und `:global(.task-list-item)` funktionieren mit dart-sass und Vite — aber Vite muss mit `api: "modern-compiler"` konfiguriert sein, sonst kommen Deprecation-Warnings.

8. **highlight.js-Sprachen sind CommonJS**: `module.exports = function(hljs) {…}`. Vite (ESM) kann das nicht als default-import laden. Wir haben sie zu `export default function(hljs) {…}` umgeschrieben.

9. **CodeMirror in flex-Layout scrollt nicht out-of-the-box**: Braucht `flex: 1 1 0; min-height: 0` am Wrapper UND `height: 100%` auf `.cm-editor` UND `overflow: auto` auf `.cm-scroller`. Wenn der Editor immer höher wird statt zu scrollen → fehlende `min-height: 0` in der Flex-Hierarchie.

### Google Drive + Entwicklung

10. **`node_modules` in Google Drive bricht Vite**: Vite-Optimizer macht `rmdir` auf `.vite/deps_temp_*`, Google Drive hat das parallel locked → `EPERM`. Lösung: `cacheDir` auf `os.tmpdir()` setzen.

11. **Symlinks brauchen Developer-Mode auf Windows**: electron-builder lädt einen Cache mit macOS-Symlinks (für theoretisches Cross-Build). Ohne Developer-Mode oder Admin-Shell scheitert das Entpacken mit „Cannot create symbolic link". Lösung: **Settings → System → Für Entwickler → Entwicklermodus aktivieren** (einmalig, persistent).

### Library-Versionen

12. **react-resizable-panels v4 ist nicht v2**: Komplett andere API. Auf v2 bleiben.

13. **electron-builder 26 hat `@noble/hashes`-Bug**: `ERR_REQUIRE_ESM`. Auf 24.13.3 pinnen, bis upstream gefixt.

14. **`@uiw/react-codemirror` exposes `onCreateEditor`**: Damit kommt man an die `EditorView`-Instanz für Scroll-Sync. Kein offizieller Ref-Forward.

### Architektur-spezifisch

15. **`vite-plugin-electron` rebuildet Main bei jeder Änderung an `electron/**`**: Electron wird dann auto-restartet. Wenn Änderungen nicht greifen → Prozess läuft im Hintergrund weiter (siehe Windows TaskManager).

16. **`safeStorage` braucht `app.whenReady()`**: Vor `app.ready` ist die OS-Verschlüsselung nicht verfügbar. Daher AuthService **nicht** im Module-Scope instantiieren, sondern erst in `createWindow` oder erst beim ersten IPC-Call.

17. **HttpOnly-Cookies in Dev-Mode (Web) brauchen `credentials: "include"` im fetch**: Sonst sendet der Browser sie nicht zurück. Im Production-Mode mit Same-Origin nicht zwingend nötig — aber wir setzen es trotzdem, damit Dev-Setup (Vite auf 5173 → Express auf 3000) auch funktioniert.

18. **`Secure`-Cookie braucht HTTPS**: Beim Internet-Deployment ohne HTTPS scheitert der Login (Cookie kommt nicht zurück), die App zeigt aber nur „nicht angemeldet". Reverse-Proxy mit Cert ist Pflicht.

### Strapi-Setup für den Editor

19. **API-Token (falls einer benutzt wird): minimaler Scope**
   - `find` / `findOne` / `update` / `create` auf `ba-blog-post`
   - `find` auf `ba-blog-category`, `upload`, `custom-user` (für Relations in der Preview)
   - `actions/publish` ist Admin-API, kein API-Token nötig (war nur für die alte GraphQL-Variante relevant)

20. **Welche Felder werden bei Strapi-v5-`PUT` ignoriert?**: Beziehungen (`HeroImage`, `Author`, `ba_blog_categories`, `Links`) werden im aktuellen Code **nicht** mit-gespeichert, weil wir nur `{ Content }` senden. Editor erlaubt aktuell nur Markdown-Body-Edits. Wenn HeroImage etc. später editierbar werden soll → Strapi v5 Relations API verwenden (`HeroImage: { connect: [{ id: x }] }` o.ä.).

---

## Weitere Hinweise

### Wo liegt der Code für ein neues Feature?

| Feature | Frontend | Backend (Electron) | Backend (Web) |
|---|---|---|---|
| Neue Strapi-Aktion | `src/api/strapi.ts` | `electron/strapi.ts` + IPC in `electron/main.ts` + `electron/preload.ts` | `server/lib/strapi.ts` + Route in `server/routes/posts.ts` |
| Neue UI-Komponente | `src/components/` | – | – |
| Neuer Auth-Endpoint | `src/api/auth.ts` | `electron/auth.ts` + IPC | `server/routes/auth.ts` |

### Wie teste ich Änderungen?

- **Type-Check**: `npx tsc --noEmit` (Frontend + Electron) und `npx tsc -p tsconfig.server.json --noEmit` (Server)
- **Electron Dev**: `npm run dev`
- **Web Dev**: `npm run dev:web` (Vite auf 5173, Express auf 3000)
- **Docker lokal**: `docker build -t blog-editor . && docker run -p 8080:3000 blog-editor`

### Externe Abhängigkeiten

| Service | URL | Verwendet für |
|---|---|---|
| Strapi CMS | `https://cms.brandeis.de` | Auth, Inhalte |
| Gatsby Live-Site | `https://www.brandeis.de` | Wird **nicht** direkt aufgerufen, aber Vorschau soll deren Optik treffen |

### Gatsby-Repo

Pfad in der Entwicklung war `C:\Users\micro\gatsby\brandeis-academy`. Bei Style-Änderungen dort musst du **manuell** rüberkopieren:

- `src/styles/globalStyles.scss` → `src/styles/gatsby/globalStyles.scss`
- `src/styles/blogLayout.module.scss` → `src/styles/gatsby/blogLayout.module.scss`
- `src/styles/content_style.module.scss` → `src/styles/gatsby/content_style.module.scss`
- `src/styles/globalDefinitions.scss` → `src/styles/gatsby/globalDefinitions.scss`
- `src/highlight.js/lib/languages/{abap,cds,bdl}.js` → `src/render/highlight-langs/{abap,cds,bdl}.js`
  - Achtung: `module.exports = function(hljs)` zu `export default function(hljs)` umschreiben

Ein automatisches Sync-Script ist noch nicht implementiert (siehe „Future Work" in der Roadmap).

### Roadmap-Ideen (nicht umgesetzt)

- **CSS-Sync-Script** mit Drift-Detection (`scripts/sync-gatsby.mjs`)
- **Bild-Upload aus dem Editor** (Strapi Upload API + Markdown-Insert)
- **Auto-Updates** für Electron via `electron-updater` + GitHub Releases
- **Kategorie-Labels** statt Slugs in der Preview (braucht zusätzliches GraphQL-Query mit Localizations)
- **Frontmatter-Editor** für strukturierte Felder (Title, Excerpt, Author)
- **Multi-User-Awareness**: Anzeige, wenn ein Kollege denselben Post offen hat (würde Websocket + Server-State brauchen)
