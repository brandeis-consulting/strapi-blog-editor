# Architektur, Entscheidungen und Lessons Learned

Dieses Dokument richtet sich an Maintainer, die das Projekt übernehmen oder weiterentwickeln. Es beantwortet vier Fragen:

1. **Was sollte das Tool können?** → [Anforderungen](#anforderungen)
2. **Wie ist es gebaut?** → [Architektur](#architektur)
3. **Warum wurde es so gebaut?** → [Architekturentscheidungen](#architekturentscheidungen-adrs)
4. **Was würde mich beim Weiterarbeiten überraschen?** → [Lessons Learned](#lessons-learned)

> **Historischer Hinweis:** Das Projekt war ursprünglich als Electron-Desktop-App konzipiert und wurde parallel als Web-Service entwickelt. Mit Version 0.2.0 wurde die Electron-Variante entfernt (siehe [ADR-001](#adr-001-electron-variante-wieder-entfernt)). Lessons Learned aus der Electron-Phase bleiben dokumentiert, da sie für ähnliche Entscheidungen in Zukunft hilfreich sein können.

---

## Anforderungen

Entstanden iterativ während der Entwicklung. In ungefährer Implementierungsreihenfolge:

### Kernfunktionen (MVP)
- Blogposts aus Strapi CMS (`cms.brandeis.de`) laden
- Liste aller Posts, **chronologisch sortiert, gruppiert nach Jahr und Monat**
- Markdown im Editor anzeigen und bearbeiten
- **Live-Preview** — seit [ADR-014](#adr-014-vorschau-als-iframe-auf-die-gatsby-site) nicht mehr „im gleichen Stil", sondern als iframe auf der Live-Site selbst
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
- **Feld-Editor** (Strg+E) für Titel, Slug, Kurzbeschreibung, Sprache, Template, Autor, Kategorien, Beitragsbild, Karriere-Flag, Veröffentlichungsdatum und Links — siehe [ADR-013](#adr-013-feld-editor-schreibt-eine-whitelist-und-liest-danach-neu)
- **Save vs. Publish trennen**: Nur Draft oder Draft + Live veröffentlichen
- **Diff-Dialog** vor jedem Save zeigt zeilenweise +/− Änderungen
- **Veröffentlichen ohne Änderungen** möglich (für nachträgliches Publish eines gespeicherten Drafts)
- **Bilder aus Zwischenablage** per `Strg+V` in Strapi hochladen und Markdown-Link einfügen

### Distribution
- **Web-Service** als Docker-Container für Portainer-Deployment
- Reverse-Proxy (Caddy) für HTTPS

### Auth & Sicherheit
- Login mit **Strapi-Admin-Account** (jeder Kollege hat ohnehin einen für das Admin-Panel)
- Identitäts-Tracking pro Kollege (kein shared Token)
- JWT im Server-`HttpOnly`-Cookie (XSS-sicher)
- Bei Session-Ablauf Re-Login-Overlay **ohne Verlust ungespeicherter Eingaben** (AppShell bleibt gemountet)

---

## Architektur

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + TypeScript)                          │
│                                                                 │
│  src/                                                           │
│  ├── App.tsx              Auth-Gate                            │
│  ├── AppShell.tsx         Hauptlayout, States, Handlers        │
│  ├── api/                 Strapi-Client (fetch → /api/*)       │
│  ├── components/          Login, PostList, Editor, Preview, …  │
│  ├── hooks/               useAuth, usePosts, useIframeScroll…  │
│  ├── lib/                 Feldlogik + Vorschau-Payload         │
│  └── render/annotate.ts   Diff-Marks im Markdown               │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP (Cookie)
┌────────────────────────────────────────────────────────────────┐
│  Express Server (Node 20 + TypeScript → CommonJS)              │
│  server/                                                        │
│  ├── index.ts              Static files + Routing + Helmet     │
│  ├── routes/auth.ts        /api/auth/login, /logout, /me       │
│  ├── routes/posts.ts       /api/posts/*  (proxiet zu Strapi)   │
│  ├── routes/upload.ts      /api/upload/image (multipart)       │
│  ├── middleware/auth.ts    JWT-Cookie-Reader                   │
│  └── lib/strapi.ts         StrapiClient (REST)                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTPS (Bearer JWT)
              ┌────────────────────────────────────────┐
              │  Strapi v5  (cms.brandeis.de)         │
              │                                        │
              │  POST /admin/login                    │
              │  GET  /admin/users/me                 │
              │  GET  /content-manager/collection-     │
              │       types/api::ba-blog-post...      │
              │  PUT  .../<documentId>                │
              │  POST .../<documentId>/actions/publish│
              │  POST /upload                         │
              └────────────────────────────────────────┘
```

### Deployment-Topologie

```
Internet
   │
   ▼ :80, :443
┌──────────────────────────────────┐
│  Caddy (Reverse Proxy)            │
│  - automatisches Let's Encrypt   │
│  - reverse_proxy → blog-editor   │
└──────────────────────────────────┘
   │ (Docker-Netzwerk "proxy")
   ▼ :3000
┌──────────────────────────────────┐
│  blog-editor Container            │
│  - Express + Static Files         │
│  - Healthcheck /healthz           │
└──────────────────────────────────┘
   │
   ▼ HTTPS
   Strapi CMS
```

### Build- und Run-Modi

| Modus      | Befehl              | Auth-Persistenz                  | Ergebnis                          |
| ---------- | ------------------- | -------------------------------- | --------------------------------- |
| Dev        | `npm run dev`       | `HttpOnly`-Cookie (ohne Secure)  | Vite 5173 + Express 3000          |
| Build      | `npm run build`     | –                                | `dist/` (Renderer) + `dist-server/` |
| Production | `npm start`         | `HttpOnly`-Cookie + `Secure`     | Single Node-Prozess auf 3000      |
| Docker     | `docker compose up` | wie Production                   | Container hört auf 3000           |

### Datenfluss beim Speichern

1. User editiert Markdown im CodeMirror → `handleDraftChange(value)` updated `buffers.get(documentId).draft`
2. `Strg+S` oder Button öffnet `PublishDialog` mit Zeilen-Diff
3. User wählt „Nur Entwurf speichern" oder „Speichern & veröffentlichen"
4. **Save-Logik:**
   - Wenn dirty: `PUT /api/posts/<id>` mit `{ content?, fields? }` → Server → **ein** Strapi-PUT auf `/content-manager/collection-types/<uid>/<id>`. Beide Teile sind einzeln optional; zusammen ergeben sie trotzdem nur einen Request (ein Fehler dazwischen hinterließe sonst einen halb gespeicherten Beitrag)
   - Wenn Modus=publish: zusätzlich `POST /api/posts/<id>/publish` → Strapi `.../actions/publish`
   - Anschließend wird der Beitrag per `getPost` **neu geladen** und ersetzt den Buffer-Eintrag, dirty wird false (siehe [ADR-013](#adr-013-feld-editor-schreibt-eine-whitelist-und-liest-danach-neu))

### Datenfluss beim Bild-Paste

1. CodeMirror-Editor (`src/components/Editor.tsx`) hat einen `onPaste`-Handler auf dem Container
2. Bei `image/*` in `clipboardData.items`:
   - sofortige Insertion eines Platzhalters `![Bild wird hochgeladen … (xyz123)]()` an der Cursor-Position
   - Upload im Hintergrund: `POST /api/upload/image` multipart → Server proxiet via `StrapiClient.uploadImage` zu `POST <strapi>/upload`
   - Bei Erfolg: Platzhalter wird durch `![filename](absolute-url)` ersetzt (auch wenn der User in der Zwischenzeit weitergetippt hat — Suche per `doc.indexOf(placeholder)`)
   - Bei Fehler: Platzhalter wird durch `![Upload fehlgeschlagen: …]()` ersetzt

### Buffer-System

`AppShell` hält `Map<documentId, { detail: PostDetail; draft: string }>`. Vorteile:
- Wechsel zwischen Posts verliert keine ungespeicherten Änderungen
- Cache: bereits geladene Posts werden nicht erneut vom Server geholt
- `dirtyIds = Set<id>` wird daraus per `useMemo` abgeleitet

Buffer leben nur im Arbeitsspeicher des Browsers. Tab-Schließen leert sie — bewusst, siehe [ADR-005](#adr-005-buffer-nur-im-memory-keine-localstorage-persistenz).

**Session-Ablauf verliert keine Buffer:** Ein 401 während der Arbeit unmountet die `AppShell` nicht. `useAuth.invalidate()` setzt nur `sessionExpired = true` (der `user`-State bleibt), `App.tsx` legt die `Login`-Komponente als Overlay (`overlay`-Prop, E-Mail vorausgefüllt) über die weiterhin gemountete Shell. Nach erfolgreichem Re-Login verschwindet das Overlay; Buffer, aktiver Post und Layout sind unverändert.

---

## Architekturentscheidungen (ADRs)

### ADR-001: Electron-Variante wieder entfernt

**Status:** akzeptiert (ersetzt ursprüngliche Hybrid-Entscheidung)

**Kontext:** Initial wurden Electron- und Web-Variante parallel gepflegt. Die Hybrid-Architektur erlaubte beides, brachte aber Komplexität: Mode-Switches im Frontend (`__APP_MODE__`), duplizierter Strapi-Client (`electron/strapi.ts` + `server/lib/strapi.ts`), zwei Build-Pipelines, eigene Auth-Pfade (`safeStorage` vs. Cookie), Windows-spezifische Build-Probleme.

Die Praxis zeigte: Kollegen nutzen die Web-Variante. Die Electron-Variante hätte eigene Wartung verlangt (Auto-Updates, Code-Signing, Windows-Build-Server) ohne klaren Mehrwert über den Browser hinaus.

**Entscheidung:** Mit Version 0.2.0 alle Electron-Bestandteile entfernt:
- `electron/` Verzeichnis gelöscht
- Dependencies `electron`, `electron-builder`, `vite-plugin-electron`, `vite-plugin-electron-renderer` entfernt
- Mode-Switch (`__APP_MODE__`) aus dem Frontend entfernt
- Type-Definitionen von `electron/strapi.ts` nach `src/types.ts` verschoben
- Build-Scripts (`dist`, `dist:portable`, `dist:installer`) entfernt

**Konsequenzen:**
- ✓ Kleinere Codebase, einfacheres Onboarding
- ✓ Eine einzige Auth-Strategie (Cookie)
- ✓ Keine Windows-Code-Signing-Probleme mehr
- ✗ Wer offline arbeiten will, kann das nicht mehr — Web-Service braucht Verbindung zum Server

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

| API                       | Auth                        | Verwendung                  |
| ------------------------- | --------------------------- | --------------------------- |
| `/api/...`                | API-Token, End-User-JWT     | Public/Frontend (Gatsby)    |
| `/graphql`                | API-Token, End-User-JWT     | Public/Frontend (Gatsby)    |
| `/content-manager/...`    | Admin-JWT                   | Strapi-Admin-Panel          |
| `/upload`                 | beides                      | Media Library               |

**Entscheidung:** `/content-manager/collection-types/api::ba-blog-post.ba-blog-post` benutzen. Funktioniert mit Admin-JWT.

**Konsequenzen:**
- ✓ Admin-JWT passt
- ✗ API-Format ist anders (`{ results, pagination }` statt `{ data, meta }`)
- ✗ Strapi v5 draft & publish: PUT updated nur Draft, separater `POST .../actions/publish` für live

### ADR-004: SCSS und Highlight-Sprachen aus Gatsby kopieren (statt nachbauen)

**Status:** ~~akzeptiert mit bekanntem Risiko~~ — **abgelöst durch [ADR-014](#adr-014-vorschau-als-iframe-auf-die-gatsby-site)**. Das hier beschriebene Drift-Risiko ist eingetreten (siehe dort). Die Kopien sind entfernt; der Abschnitt bleibt als Begründung stehen, warum der Weg zunächst gewählt wurde.

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
- ✗ Sync ist manuell (Sync-Script ist Roadmap-Idee, nicht implementiert)

### ADR-005: Buffer nur im Memory, keine localStorage-Persistenz

**Status:** akzeptiert

**Kontext:** Der Buffer (`Map<documentId, { detail, draft }>`) hält ungespeicherte Änderungen. Beim Tab-Schließen gehen sie verloren.

**Entscheidung:** Bewusst keine `localStorage`-/`sessionStorage`-Persistenz.

**Begründung:**
- Drafts, die Tage oder Wochen alt sind, verwirren mehr als sie helfen
- Strapi v5 hat ohnehin draft & publish — User soll explizit speichern
- Risiko von „verlorenen" Drafts beim Tab-Switch ist gering, weil der User in der Regel innerhalb einer Session arbeitet
- Bei Multi-User-Editing könnten persistente Buffers fremde Änderungen überschreiben

**Bei Änderung:** Wenn Persistenz gewünscht, in `AppShell` ergänzen. Bei Strapi-seitigen Updates am Original-Content sollten persistente Buffers invalidiert werden.

### ADR-006: react-resizable-panels v2, nicht v4

**Status:** akzeptiert

**Kontext:** v4.x dieser Library hat eine komplett andere API (`Group`/`Separator` statt `PanelGroup`/`PanelResizeHandle`). Initial wurde v4 installiert, war undokumentiert und brachte den Renderer zum Crash.

**Entscheidung:** Auf `^2` pinnen in `package.json`.

**Bei Update:** v2 ist Maintenance-Mode. v3 ist API-kompatibel. v4 würde Refactor des `PanelGroup`-Setups bedeuten — nicht ohne Grund machen.

### ADR-007: Express-Server als CommonJS, nicht ESM

**Status:** akzeptiert

**Kontext:** Initial wurde `tsconfig.server.json` mit `module: "ESNext"` gebaut. Node 20 verlangt aber bei ESM **vollständige `.js`-Endungen in Imports** (`./routes/auth.js`). `tsc` schreibt die nicht automatisch in den Output, daher `ERR_MODULE_NOT_FOUND` im Docker-Container.

**Entscheidung:** Server als CommonJS bauen (`module: "CommonJS"`, `moduleResolution: "Node"`). Frontend bleibt ESM (vite-Bundler kümmert sich).

**Konsequenzen:**
- ✓ Keine `.js`-Endung-Akrobatik nötig
- ✓ `__dirname` direkt verfügbar (kein `fileURLToPath`-Workaround)
- ✗ Bei `fetch`/`Blob`/`FormData` (Web-API in Node 20+) braucht tsconfig zusätzlich `"DOM"` in der `lib`-Liste

### ADR-008: JWT via HttpOnly-Cookie

**Status:** akzeptiert

**Kontext:** Frontend braucht einen Persistenz-Mechanismus für das JWT.

**Entscheidung:** Server setzt JWT in `HttpOnly`-Cookie mit `SameSite=Strict`, in Production zusätzlich `Secure`.

**Begründung:**
- XSS-sicher (JS kann das Cookie nicht lesen)
- Automatisch bei jedem Request mitgesendet
- Logout = Cookie löschen, kein Frontend-State-Management

**Bei Änderung:** `localStorage`-JWT wäre einfacher zu debuggen, aber XSS-anfällig. CSRF-Schutz hätten wir bei `Bearer`-Auth nicht zu denken — Cookie-Auth braucht `SameSite=Strict` (haben wir).

### ADR-009: Diff-Highlight als `<mark>` im Markdown-Source

**Status:** akzeptiert

**Kontext:** Geänderte Wörter sollen in der Preview sichtbar sein.

**Entscheidung:** `diffWords(original, draft)` liefert Chunks, Added-Chunks werden in `<mark class="diff-added">…</mark>` eingewickelt — direkt im Markdown-String vor dem Rendering. `rehype-raw` lässt das durch. Die Logik liegt in `src/render/annotate.ts`.

**Begründung:** Pragmatisch, kein Custom-Plugin nötig.

**Schutzmaßnahmen** (damit Marks keine Block-Konstrukte zerstören):
- Marks werden **zeilenweise** gesetzt (`markPerLine`) — ein Mark über einen Zeilenumbruch hinweg würde Absätze/Tabellen/Listen zusammenkleben
- Code-Fences: Fence-Erkennung auf der Mark-freien Zeile, Marks in Fences und auf Fence-Zeilen werden gestrippt (`stripMarksInsideCodeFences`)
- GFM-Tabellen: Marks vor dem ersten Pipe oder in der Trennzeile brechen die Tabellenerkennung und werden gestrippt (`stripMarksBreakingTables`); Marks **innerhalb** einer Zelle bleiben erhalten

**Bekannte Grenzen:**
- `<mark>` mitten in Inline-Konstrukten (`[link](url)`, `**bold**`) kann Layout brechen
- Komplett neu getippte Tabellen und Codeblöcke werden korrekt gerendert, aber nicht hervorgehoben
- Removed-Words werden nicht angezeigt (würde Preview-Länge verändern)

### ADR-010: Image-Paste schreibt sofortigen Platzhalter

**Status:** akzeptiert

**Kontext:** Bilder können von Sekundenbruchteilen bis mehrere Sekunden hochzuladen brauchen. Während dieser Zeit soll der User weiterschreiben können.

**Entscheidung:** Sofortiges Insert eines unique Platzhalters (`![Bild wird hochgeladen … (xyz123)]()`). Upload läuft asynchron. Bei Erfolg/Fehler wird der Platzhalter per `doc.indexOf(placeholder)` gefunden und ersetzt — funktioniert auch wenn der User in der Zwischenzeit getippt hat, weil der Platzhalter eine zufällige ID enthält.

**Konsequenzen:**
- ✓ Non-blocking UX
- ✓ Mehrere parallele Uploads funktionieren (jeder Platzhalter ist unique)
- ✗ Wenn der User den Platzhalter manuell löscht, landet das fertige Bild stattdessen am Dokumentende (mit Hinweis-Newline) — pragmatischer Fallback

---

### ADR-011: Übersetzung serverseitig, API-Key pro Anfrage

**Status:** akzeptiert

**Kontext:** Ein Button soll einen Beitrag ins Englische übersetzen. Die Claude-API kostet pro Aufruf direktes Geld, und der Editor läuft als geteilter Web-Service — ein hinterlegter Key wäre für alle Angemeldeten nutzbar, ohne dass jemand die Kosten bemerkt.

Zwei technische Randbedingungen entscheiden mit:
- Die CSP in `server/index.ts` setzt `connect-src 'self'`. Der Browser kann `api.anthropic.com` also gar nicht erreichen.
- Ein Key im Frontend wäre ohnehin über die DevTools einsehbar.

**Entscheidung:**
- Die Übersetzung läuft in `server/routes/translate.ts`, nicht im Browser.
- Der Key kommt aus einem Modal, wird pro Anfrage übergeben, für genau einen Aufruf verwendet und **nirgends gespeichert** — weder in `localStorage`, noch in einer Env-Variable, noch serverseitig.
- Bewusst *keine* Env-Variable: die Reibung ist der Zweck. Wer übersetzt, entscheidet sich sichtbar für die Kosten.

**Konsequenz:** Bei mehreren Beiträgen hintereinander muss der Key mehrfach eingegeben werden. Das ist gewollt; ein Opt-in „für diese Sitzung merken“ wäre die naheliegende Erweiterung, falls es stört.

### ADR-012: Übersetzungs-Prompt dupliziert statt geteilt

**Status:** akzeptiert (mit bekanntem Nachteil)

**Kontext:** Dieselbe Übersetzung gibt es zweimal: als Massenlauf in `brandeis-academy/scripts/translate-posts.mjs` (Message Batches API, 50 % günstiger, asynchron) und hier als Einzelaufruf. System-Prompt, JSON-Schema und die Nachbehandlung müssen identisch sein, sonst übersetzen beide Wege unterschiedlich. Die beiden liegen in **getrennten Repos**; ein gemeinsames npm-Paket wäre sauber, bedeutet aber Versionierung und Veröffentlichung für zwei Aufrufstellen.

**Entscheidung:** Prompt und Schema sind in `server/lib/translate.ts` dupliziert, mit gegenseitigem Verweis im Dateikopf beider Dateien.

**Konsequenz:** Änderungen am Prompt müssen an beiden Stellen nachgezogen werden. Sobald eine dritte Aufrufstelle entsteht, lohnt sich das gemeinsame Paket.

**Unterschied, der bleiben darf:** Der Batch nutzt die Message Batches API (günstiger, dafür Wartezeit von Minuten), der Editor einen synchronen Aufruf — hier zählt die Antwortzeit.

### ADR-013: Feld-Editor schreibt eine Whitelist und liest danach neu

**Status:** akzeptiert

**Kontext:** Bis dahin war `Content` das einzige schreibbare Feld — Autor, Beitragsbild, Datum, Kategorien und Template mussten im Strapi-Admin gepflegt werden. Beim Freilegen der übrigen Felder stellten sich drei Fragen.

**Entscheidung 1 — Whitelist statt durchgereichtem Body.** `saveDraft` nimmt ein `PostFields`-Objekt und baut daraus explizit den Strapi-Body. Ein durchgereichter Request-Body wäre kürzer, ließe aber jeden angemeldeten Nutzer beliebige Attribute setzen (`publishedAt`, `createdBy`, `translation_related_posts`). Letzteres wird von der Übersetzungsfunktion gepflegt und darf hier nicht versehentlich überschrieben werden.

**Entscheidung 2 — nach dem Schreiben `getPost` statt der PUT-Antwort.** Das Content-Manager-API populiert Relationen beim Schreiben nicht zwingend in derselben Form wie unser `getPost` (das die `populate`-Parameter explizit setzt). Übernähmen wir die PUT-Antwort direkt in den Buffer, stünde der Beitrag danach womöglich ohne Autor und Kategorien da — und wäre sofort wieder als „geändert" markiert, weil `fieldsFromPost` andere Werte liefert als vor dem Speichern. Ein zusätzlicher GET pro Speichervorgang ist der Preis dafür, dass der Buffer garantiert dem entspricht, was ein frischer Ladevorgang ergäbe.

**Entscheidung 3 — Relationen als IDs im Buffer.** `PostFields` trägt `authorId`, `categoryIds` und `heroImageId`, nicht die Objekte — das ist die Form, die Strapi beim Schreiben erwartet (bewährt in `createTranslation`). Die Bild-URL, die Vorschau und Feld-Editor trotzdem brauchen, liegt in einem separaten Nachschlage-Cache (`heroUrls` in `AppShell`) statt ein zweites Mal im Buffer, wo sie mit der ID auseinanderlaufen könnte.

**Entscheidung 4 — Component-`id`s der Links werden mitgeführt.** `BlogLink` trägt ein optionales `id`. Ohne dieses Feld löscht Strapi bei jedem Speichern alle Link-Zeilen und legt sie neu an; mit ihm aktualisiert es die bestehende Zeile. Neue Einträge aus dem Editor haben keins — das ist der Normalfall und genau richtig so.

**Gegen das echte CMS geprüft** (28.08.2026, Testbeitrag `zz-editor-test`): alle Feldtypen, das Setzen *und* Leeren der drei Relationen, Links anlegen/ändern/entfernen mit id-Erhaltung, sowie der Publish mit `OverridePublishDate` aus dem Feld-Editor.

**Konsequenzen:**
- ✓ Kein Wechsel mehr ins Admin-Panel für die Standardfelder
- ✓ Dirty-Erkennung deckt Inhalt *und* Felder ab (`fieldsEqual` normalisiert die Kategorie-Reihenfolge, die bedeutungslos ist)
- ✓ Die Vorschau zeigt ungespeicherte Feldänderungen sofort — sie liest aus dem Buffer, nicht aus dem Serverstand
- ✗ Ein neues Strapi-Feld muss an **drei** Stellen nachgezogen werden: `PostFields` (beidseitig) und die Whitelist in `saveDraft`
- ✗ Ein GET mehr pro Speichervorgang

**Zwei Vorschau-Fehler, die dabei mit aufgefallen sind** (beide vorher falsch, jetzt an `gatsby-node.js` angeglichen):
- Das Datum kam aus `createdAt`. Gatsby überschreibt `createdAt` mit `PublishDate`, sobald eines gesetzt ist — bei jedem Beitrag mit gesetztem Datum stand in der Vorschau das falsche.
- `CATEGORY_LABELS` in `Preview.tsx` war ein leeres Objekt, die Vorschau zeigte immer den Slug. Die Labels kommen jetzt aus den `localizations` der Kategorie, in der Sprache des Beitrags — dieselbe Auswertung wie `categoryLanguageMapping`.

### ADR-014: Vorschau als iframe auf die Gatsby-Site

**Status:** akzeptiert

**Kontext:** Die Vorschau war ein Nachbau: kopiertes SCSS (ADR-004) plus eine nachgebaute react-markdown-Pipeline plus ein von Hand nachgezogenes Standard-Layout in `Preview.tsx`. Das Drift-Risiko aus ADR-004 hat sich eingelöst, und zwar deutlicher als erwartet:

- Die Blogpost-Klassen (`.blog-post`, `.post-attribute-line`, `.cat-tag`, …) waren im Gatsby-Repo nach `components/blog-templates/default-template.module.scss` umgezogen. Die gleichnamige `blogLayout.module.scss` enthielt dort nur noch die Blog-*Übersicht* — ein bloßes Nachkopieren hätte die Vorschau **entstylt**.
- `rehypeMarkdownAttributes` (`{#id}` / `{.class}`) fehlte im Editor komplett. Newsletter-Beiträge zeigten die geschweiften Klammern als Text.
- Von drei Templates (Standard, Cheatsheet, Newsletter) kannte die Vorschau nur eines.
- Datum und Kategorie-Labels waren falsch (siehe ADR-013).

Damit war klar: Ein Sync-Script hätte das nicht gelöst, weil nicht nur der Inhalt, sondern die Ablagestruktur driftet.

**Verworfene Alternative — gemeinsames Render-Paket.** Pipeline, Styles und Artikel-Rümpfe in ein npm-Paket, das beide Projekte konsumieren. Löst die Drift ebenfalls, kostet aber eine dauerhafte *Portabilitätssteuer*: der Renderer müsste in Gatsbys webpack **und** in Vite kompilieren. Jedes Gatsby-spezifische Detail im Artikelkörper (`gatsby-plugin-image`, `Link`, `graphql`) bräche dann den Editor. Dazu käme Versionierung über zwei Repos hinweg — und npm kann keine Unterordner aus einem git-Repo installieren, was einen Publish-Schritt erzwungen hätte.

**Entscheidung:** Die Vorschau rendert im **iframe auf der Gatsby-Site** (`/blog-preview`). Der Editor schickt Beitrag und Markdown per `postMessage`; die Seite rendert damit dieselben Komponenten wie die Live-Seite.

Dafür wurde in Gatsby der Artikelkörper je Template herausgelöst (`default-body.js`, `cheatsheet-body.js`, `newsletter-body.js`). Die echten Templates legen Layout, SEO, Sprachumschalter und NewsSlider darum, die Vorschauseite nur `.layout-main > .layout-center`. Diese Entflechtung ist deutlich flacher als eine Extraktion in ein Paket: sie bleibt in Gatsbys Buildsystem, also gibt es keine Portabilitätssteuer.

**Konsequenzen:**
- ✓ Drift ist **konstruktiv ausgeschlossen** — Vorschau und Live-Seite sind derselbe Code
- ✓ Cheatsheet und Newsletter werden korrekt dargestellt, `{#id}`/`{.class}` funktioniert, ABAP/CDS/BDL-Highlighting kommt von der Site
- ✓ Aus dem Editor sind ~1900 Zeilen kopiertes SCSS, die nachgebaute Markdown-Pipeline und fünf Dependencies (`react-markdown`, `remark-gfm`, `rehype-highlight`, `rehype-raw`, `highlight.js`) entfallen; Hauptbundle 1377 kB → 848 kB
- ✓ Der Entwurf geht bei jedem Tastendruck hinüber — gespeichert werden muss nichts (die naheliegende Nachbildung des „Strapi-Vorschau"-Buttons hätte nur den Serverstand gezeigt)
- ✗ **Ohne erreichbare Gatsby-Site keine Vorschau.** Bewusst kein lokaler Fallback: ein veralteter Nachbau wäre schlimmer als eine ehrliche Fehlermeldung, weil er still Falsches zeigte
- ✗ Template- und CSS-Änderungen erscheinen erst nach dem nächsten Site-Build. Für die Redaktion irrelevant — der Editor verwaltet Inhalte, nicht Templates
- ✗ Zwei neue Kopplungen zwischen den Repos: `frame-ancestors` in `static/_headers` muss den Editor erlauben, und `src/lib/previewPayload.ts` muss zur Beitragsstruktur der Bodies passen
- ✗ Scroll-Sync läuft über Nachrichten statt direkt (`useIframeScrollSync`), weil das iframe cross-origin ist

**Sicherheit:** Beide Seiten prüfen `event.origin` und senden nie an `"*"`. Die Vorschauseite akzeptiert nur die Origins des Editors (plus ihren eigenen), der Editor nur den Origin der Vorschau. `frame-src` in der Editor-CSP wird aus `PREVIEW_URL` abgeleitet, damit beides nicht auseinanderlaufen kann.

## Lessons Learned

Konkrete Stolpersteine, die mich Zeit gekostet haben — damit dich dieselben nicht überraschen.

### Strapi-Quirks

1. **Zwei User-Systeme**: Admin Users ≠ End Users. Admin-JWT funktioniert **nicht** für `/api/...` oder `/graphql`, nur für `/content-manager/...`, `/admin/...` und `/upload`. Wenn Login klappt aber Datenabruf nicht → vermutlich falsche API.

2. **Token-Permissions sind feingranular**: Ein API-Token mit `find` auf `ba-blog-post` reicht **nicht**, wenn der Post Relations (HeroImage, Author, Categories) hat. Diese Content-Types brauchen ebenfalls explizite Permissions, sonst `Forbidden access` für den ganzen Document-Aufruf — nicht nur für die Relation.

3. **Content-Type-Builder ist nur Admin**: Der Endpoint `/api/content-type-builder/content-types` liefert 403 mit API-Tokens. Schema ableiten geht über die Gatsby-Source-Config (`gatsby-config.js` → `collectionTypes` mit `populate`-Definitionen) oder über die tatsächliche Response.

4. **Strapi v5 draft & publish**: `PUT /content-manager/.../<id>` aktualisiert nur den Draft. Damit es live auf der Gatsby-Site erscheint, **zusätzlich** `POST /actions/publish` aufrufen. Wir trennen das im Frontend bewusst in zwei Buttons.

5. **documentId statt id**: In Strapi v5 wird der externe Identifier `documentId` genannt. In GraphQL: `filters: { documentId: { eq: "..." } }`. In Content-Manager-URLs: `/content-manager/collection-types/<uid>/<documentId>`. Verwechsle das nicht mit der internen DB-`id`.

6. **`populate[localizations]` greift auf dem Content-Manager-*Listen*endpunkt nicht.** Die Gatsby-Query holt Kategorie-Übersetzungen so; `/content-manager/collection-types/<uid>?populate[localizations]=true` liefert dagegen kommentarlos **nur die Standardsprache** — kein Fehler, kein leeres Feld, die Übersetzungen fehlen einfach. Symptom: englische Beiträge zeigen deutsche Kategorie-Labels. Lösung: je Locale einzeln abfragen (`?locale=de`, `?locale=en`) und über die `documentId` zusammenführen — die ist in Strapi v5 über alle Sprachfassungen eines Dokuments identisch.

7. **`/upload/files` ignoriert die `pagination[...]`-Schreibweise.** Mit `pagination[pageSize]=60` kommen stumm die ersten **10** Dateien. Das Upload-Plugin will flaches `page`/`pageSize`. Kein Fehler, keine Warnung — nur eine zu kurze Liste, was man leicht für „so wenig ist halt drin" hält.

8. **Der Content-Manager-GET liefert immer den Entwurf.** Nach einem erfolgreichen Publish ist `publishedAt` in der Antwort von `GET /content-manager/collection-types/<uid>/<documentId>` weiterhin `null` — das ist korrekt, nicht kaputt: Draft und Published sind in v5 zwei Fassungen desselben Dokuments, und der GET liefert ohne `?status=published` die Entwurfsfassung. Ob ein Publish gewirkt hat, sieht man an der **Antwort der Publish-Aktion**, nicht an einem anschließenden GET.

9. **Repeatable Components: `id` mitschicken.** Die Einträge von `Links` tragen eine `id`. Schickt man sie beim PUT ohne diese ids zurück, löscht Strapi die Zeilen und legt sie neu an (neue ids). Inhaltlich richtig, aber unnötig — mit `id` aktualisiert Strapi die bestehende Zeile.

10. **Strapi `/upload` mit Admin-JWT**: Funktioniert problemlos. multipart/form-data mit Feldname `files` (auch für Single-Upload). Response ist Array mit `[{ id, url, name, mime, ... }]`. URL ist relativ — manuell `baseUrl` davorhängen.

### Vite / Build-Toolchain

11. **CSS-Modules brauchen `localsConvention`**: Gatsby benutzt camelCase-Lookup (`Styles.blogPost` → `.blog-post`-Klasse). Vite-Default ist beides (kebab + camel), aber inkonsistent. Wir setzen `localsConvention: "camelCaseOnly"`.

12. **SCSS-Module mit `:global()`**: `@use "x" as *` und `:global(.task-list-item)` funktionieren mit dart-sass und Vite — aber Vite muss mit `api: "modern-compiler"` konfiguriert sein, sonst kommen Deprecation-Warnings.

13. **highlight.js-Sprachen sind CommonJS**: `module.exports = function(hljs) {…}`. Vite (ESM) kann das nicht als default-import laden. Wir haben sie zu `export default function(hljs) {…}` umgeschrieben.

14. **CodeMirror in flex-Layout scrollt nicht out-of-the-box**: Braucht `flex: 1 1 0; min-height: 0` am Wrapper UND `height: 100%` auf `.cm-editor` UND `overflow: auto` auf `.cm-scroller`. Wenn der Editor immer höher wird statt zu scrollen → fehlende `min-height: 0` in der Flex-Hierarchie.

### Node / Server

15. **CommonJS für den Server, nicht ESM**: Node 20 ESM-Loader verlangt `.js`-Endungen in Imports — die `tsc` nicht automatisch hinzufügt. Server ist CommonJS, daher kein Suffix-Tanz, `__dirname` direkt verfügbar.

16. **`DOM`-Lib in tsconfig.server.json**: Node v18+ hat `Blob`, `fetch`, `FormData` zur Runtime, aber TypeScript braucht die DOM-Types dafür. `"lib": ["ES2022", "DOM"]` in `tsconfig.server.json` löst das.

17. **Multer für multipart**: Express parst keinen multipart-Body. Multer mit `memoryStorage()` ist die einfachste Lösung für moderate Datei-Größen (<15 MB). Bei großen Files (>50 MB) auf Disk-Storage oder Streams umsteigen.

### Google Drive + Entwicklung

18. **`node_modules` in Google Drive bricht Vite**: Vite-Optimizer macht `rmdir` auf `.vite/deps_temp_*`, Google Drive hat das parallel locked → `EPERM`. Lösung: `cacheDir` auf `os.tmpdir()` setzen.

19. **npm-Operationen können fehlschlagen wegen Drive-Sync**: `npm uninstall` oder `npm install` schlagen gelegentlich mit Permission-Fehlern fehl, weil Drive Files lockt. Workaround: `npm install` ohne Cleanup; `node_modules/` wird beim nächsten `npm ci` sauber neu aufgebaut.

### Library-Versionen

20. **react-resizable-panels v4 ist nicht v2**: Komplett andere API. Auf v2 bleiben.

21. **`@uiw/react-codemirror` exposes `onCreateEditor`**: Damit kommt man an die `EditorView`-Instanz für Scroll-Sync und Paste-Handler. Kein offizieller Ref-Forward.

### Web-spezifisch

22. **`credentials: "include"` ist Pflicht**: Im fetch-Layer für alle API-Calls — sonst werden Cookies nicht mitgesendet. In Production mit Same-Origin nicht zwingend nötig, aber wir setzen es trotzdem, damit Dev-Setup (Vite 5173 → Express 3000) funktioniert.

23. **`Secure`-Cookie braucht HTTPS**: Beim Internet-Deployment ohne HTTPS scheitert der Login (Cookie kommt nicht zurück), die App zeigt aber nur „nicht angemeldet". Reverse-Proxy mit Cert ist Pflicht.

24. **Caddy `reverse-proxy`-Command**: Macht automatisches HTTPS, wenn `--from` einen Hostnamen (kein `:80`, kein `localhost`) bekommt. Sehr viel einfacher als ein Caddyfile-Mount via `configs:` (das hat in unserer Portainer-Version nicht funktioniert).

25. **Vite-Dev-Server `proxy`-Config**: `proxy: { "/api": "http://localhost:3000" }` ist das eine Setting, das du brauchst, damit Browser auf Vite-Port 5173 die API-Calls durchreicht an den separaten Express-Prozess.

### Historisch (Electron-Phase)

Diese Punkte sind nur noch relevant, wenn jemand ein ähnliches Electron-Projekt aufsetzt:

26. **Strapi Token-File-Persistenz auf Disk ist riskant**. Wir hatten in der Electron-Variante `safeStorage` (Windows DPAPI) — verschlüsselt mit User+Machine-Bound-Key. Saubere Lösung, aber benötigt `app.whenReady()` vor erstem Aufruf.

27. **`vite-plugin-electron` HMR**: Rebuilt Main/Preload bei jeder Änderung an `electron/**`, startet Electron neu. Wenn Änderungen nicht greifen → alter Prozess läuft im Hintergrund (Windows TaskManager prüfen).

28. **electron-builder 26 hat `@noble/hashes` ESM-Bug**: `ERR_REQUIRE_ESM`. Auf 24.13.3 pinnen, bis upstream gefixt.

29. **Symlinks brauchen Developer-Mode auf Windows**: electron-builder lädt einen Cache mit macOS-Symlinks (für theoretisches Cross-Build). Ohne Developer-Mode oder Admin-Shell scheitert das Entpacken mit „Cannot create symbolic link".

---

## Weitere Hinweise

### Wo liegt der Code für ein neues Feature?

| Feature                  | Frontend                          | Backend                                              |
| ------------------------ | --------------------------------- | ---------------------------------------------------- |
| Neue Strapi-Aktion       | `src/api/strapi.ts`               | `server/lib/strapi.ts` + Route in `server/routes/`   |
| Neue UI-Komponente       | `src/components/`                 | –                                                    |
| Neuer Auth-Endpoint      | `src/api/auth.ts`                 | `server/routes/auth.ts`                              |
| Neue Upload-Variante     | `src/components/Editor.tsx` o.ä.  | `server/routes/upload.ts`                            |
| Type-Anpassung           | `src/types.ts`                    | `server/lib/strapi.ts` (in Sync halten!)             |
| Neues Beitragsfeld       | `src/types.ts` (`PostFields`, `fieldsFromPost`) + `src/components/FieldsPanel.tsx` | `server/lib/strapi.ts` (`PostFields` **und** die Whitelist in `saveDraft`) |
| Feld-Validierung         | `src/lib/postFields.ts`           | –                                                    |

### Wie teste ich Änderungen?

- **Type-Check**: `npx tsc --noEmit` (Frontend) und `npx tsc -p tsconfig.server.json --noEmit` (Server)
- **Dev**: `npm run dev` (Vite auf 5173, Express auf 3000)
- **Docker lokal**: `docker build -t blog-editor . && docker run -p 8080:3000 -e STRAPI_URL=https://cms.brandeis.de blog-editor`

### Externe Abhängigkeiten

| Service         | URL                        | Verwendet für                                                                |
| --------------- | -------------------------- | ---------------------------------------------------------------------------- |
| Strapi CMS      | `https://cms.brandeis.de`  | Auth, Inhalte, Media-Upload                                                  |
| Gatsby Live-Site | `https://www.brandeis.de` | Wird **nicht** direkt aufgerufen, aber Vorschau soll deren Optik treffen      |

### Gatsby-Repo

Die Vorschau rendert seit [ADR-014](#adr-014-vorschau-als-iframe-auf-die-gatsby-site) im iframe auf der Gatsby-Site. **Es gibt nichts mehr manuell zu kopieren** — der frühere Abgleich von `globalStyles.scss`, `blogLayout.module.scss`, `content_style.module.scss` und der highlight.js-Sprachen entfällt ersatzlos.

Was stattdessen im Gatsby-Repo (`brandeis-academy`) zu dieser Vorschau gehört:

| Datei                                              | Rolle                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `src/pages/blog-preview.js`                          | Die Vorschauseite. Nimmt den Entwurf per postMessage entgegen.      |
| `src/components/blog-templates/default-body.js`      | Artikelkörper Standard — geteilt mit `default-template.js`          |
| `src/components/blog-templates/cheatsheet-body.js`   | Artikelkörper Cheatsheet                                            |
| `src/components/blog-templates/newsletter-body.js`   | Artikelkörper Newsletter                                            |
| `static/_headers`                                    | `frame-ancestors` muss den Editor erlauben                          |

**Beim Ändern eines Templates** ist nichts zu tun, solange die Änderung im jeweiligen `*-body.js` landet — die Vorschau zieht automatisch mit. Ändert sich dagegen die **erwartete Beitragsstruktur** (ein neues Feld, das ein Body liest), muss sie in `src/lib/previewPayload.ts` dieses Repos ergänzt werden; dort steht der Vertrag zwischen beiden Projekten.

### Roadmap-Ideen (nicht umgesetzt)

- **Drag-and-Drop-Bild-Upload** aus dem Explorer (gleiche Server-Route wie Paste)
- **Multi-User-Awareness**: Anzeige, wenn ein Kollege denselben Post offen hat (würde Websocket + Server-State brauchen)
- **Auto-Save** als Draft (alle 30 s, wenn dirty)
