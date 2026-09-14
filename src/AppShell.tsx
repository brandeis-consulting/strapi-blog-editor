import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import type { EditorView } from "@codemirror/view";
import { strapi } from "./api/strapi";
import { annotateAddedWords } from "./render/annotate";
import { BrandeisLogo } from "./components/BrandeisLogo";
import {
  fieldsEqual,
  fieldsFromPost,
  type AuthorOption,
  type CategoryOption,
  type MediaImage,
  type PostDetail,
  type PostFields,
  type PostSummary,
  type SessionUser,
} from "./types";
import { describeFieldChanges, validatePostFields } from "./lib/postFields";
import { usePosts } from "./hooks/usePosts";
import { useDebounced } from "./hooks/useDebounced";
import { useIframeScrollSync } from "./hooks/useIframeScrollSync";
import { PostList } from "./components/PostList";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { FieldsPanel } from "./components/FieldsPanel";
import { PublishDialog, type SaveMode } from "./components/PublishDialog";
import { NewPostDialog } from "./components/NewPostDialog";
import { TranslateDialog } from "./components/TranslateDialog";
import styles from "./styles/app.module.scss";

const STRAPI_HOST = "https://cms.brandeis.de";

interface Props {
  user: SessionUser;
  onLogout: () => void;
}

/**
 * Per-post buffer that caches both the last server state and the in-progress
 * draft. Keeps unsaved edits intact when switching between posts.
 *
 * `fields` ist das Gegenstück zu `draft` für alles außerhalb des Markdowns:
 * beide werden gegen `detail` verglichen, um Ungespeichertes zu erkennen.
 */
interface PostBuffer {
  detail: PostDetail;
  draft: string;
  fields: PostFields;
}

export function AppShell({ user, onLogout }: Props) {
  const { posts, loading, error, reload } = usePosts();
  const [buffers, setBuffers] = useState<Map<string, PostBuffer>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [translateOpen, setTranslateOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translateNotice, setTranslateNotice] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scrollSync, setScrollSync] = useState(true);
  const [highlightChanges, setHighlightChanges] = useState(true);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Vorschau-URL kommt zur Laufzeit vom eigenen Server (siehe /api/config),
  // damit ein Wechsel der Gatsby-Instanz kein neues Docker-Image braucht.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Auswahllisten für den Feld-Editor. Einmal pro Sitzung geladen — sie ändern
  // sich selten und der Editor soll beim Postwechsel nicht nachladen.
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [allSlugs, setAllSlugs] = useState<string[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  /**
   * URL je Medien-ID. `PostFields` trägt nur die ID (das ist, was Strapi beim
   * Schreiben will), Vorschau und Feld-Editor brauchen aber ein Bild. Statt die
   * URL ein zweites Mal im Buffer zu halten — wo sie mit der ID auseinander
   * laufen könnte — steht sie hier in einem reinen Nachschlage-Cache.
   */
  const [heroUrls, setHeroUrls] = useState<Map<number, string>>(new Map());

  const activeBuffer = activeId ? buffers.get(activeId) ?? null : null;
  const activePost = activeBuffer?.detail ?? null;
  const draft = activeBuffer?.draft ?? "";
  const fields = activeBuffer?.fields ?? null;
  const debouncedDraft = useDebounced(draft, 150);

  const previewMarkdown = useMemo(() => {
    if (!highlightChanges || !activePost) return debouncedDraft;
    if (activePost.Content === debouncedDraft) return debouncedDraft;
    return annotateAddedWords(activePost.Content, debouncedDraft);
  }, [highlightChanges, activePost, debouncedDraft]);

  const previewOrigin = useMemo(() => {
    if (!previewUrl) return null;
    try {
      return new URL(previewUrl, window.location.href).origin;
    } catch {
      return null;
    }
  }, [previewUrl]);

  useIframeScrollSync(editorView, previewFrameRef, previewOrigin, scrollSync);

  useEffect(() => {
    strapi
      .getConfig()
      .then((c) => setPreviewUrl(c.previewUrl))
      .catch(() => setPreviewUrl(null));
  }, []);

  // Auswahllisten einmalig laden. Ein Fehler blockiert den Editor nicht — die
  // Textfelder funktionieren auch ohne Kategorien und Autorenliste.
  useEffect(() => {
    let cancelled = false;
    Promise.all([strapi.listCategories(), strapi.listAuthors(), strapi.listSlugs()])
      .then(([cats, auths, slugs]) => {
        if (cancelled) return;
        setCategories(cats);
        setAuthors(auths);
        setAllSlugs(slugs);
        setOptionsError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setOptionsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, buf] of buffers) {
      if (buf.draft !== buf.detail.Content) set.add(id);
      else if (!fieldsEqual(buf.fields, fieldsFromPost(buf.detail))) set.add(id);
    }
    return set;
  }, [buffers]);

  const isDirty = activeId ? dirtyIds.has(activeId) : false;
  const contentDirty = activeBuffer ? activeBuffer.draft !== activeBuffer.detail.Content : false;
  const fieldsDirty = activeBuffer
    ? !fieldsEqual(activeBuffer.fields, fieldsFromPost(activeBuffer.detail))
    : false;

  /** Slugs aller *anderen* Beiträge — Grundlage der Kollisionsprüfung. */
  const takenSlugs = useMemo(() => {
    const own = activeBuffer?.detail.Slug;
    return new Set(allSlugs.filter((s) => s !== own));
  }, [allSlugs, activeBuffer]);

  const issues = useMemo(
    () => (fields ? validatePostFields(fields, takenSlugs) : []),
    [fields, takenSlugs],
  );
  const blockingIssues = issues.filter((i) => i.blocking);

  const heroUrl = fields?.heroImageId != null ? heroUrls.get(fields.heroImageId) ?? null : null;

  function rememberHeroUrl(id: number | null | undefined, url: string | undefined): void {
    if (id == null || !url) return;
    setHeroUrls((prev) => {
      if (prev.get(id) === url) return prev;
      const next = new Map(prev);
      next.set(id, url);
      return next;
    });
  }

  function upsertBuffer(detail: PostDetail, draft?: string): void {
    rememberHeroUrl(
      detail.HeroImage?.id,
      detail.HeroImage?.url
        ? detail.HeroImage.url.startsWith("http")
          ? detail.HeroImage.url
          : `${STRAPI_HOST}${detail.HeroImage.url}`
        : undefined,
    );
    setBuffers((prev) => {
      const next = new Map(prev);
      next.set(detail.documentId, {
        detail,
        draft: draft ?? detail.Content,
        fields: fieldsFromPost(detail),
      });
      return next;
    });
  }

  /**
   * Lädt den Beitrag neu und ersetzt den Puffer damit.
   *
   * Nach Schreibvorgängen bewusst statt der PUT-Antwort verwendet: das
   * Content-Manager-API populiert Relationen beim Schreiben nicht zwingend so
   * wie unser getPost (das die populate-Parameter explizit setzt). Übernähmen
   * wir die Antwort direkt, stünde der Beitrag danach ohne Autor und ohne
   * Kategorien im Puffer — und wäre sofort wieder „geändert“.
   */
  async function refreshBuffer(documentId: string): Promise<PostDetail | null> {
    const fresh = await strapi.getPost(documentId);
    if (fresh) upsertBuffer(fresh);
    return fresh;
  }

  function handleFieldsChange(patch: Partial<PostFields>) {
    if (!activeId) return;
    setBuffers((prev) => {
      const cur = prev.get(activeId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(activeId, { ...cur, fields: { ...cur.fields, ...patch } });
      return next;
    });
  }

  function handleHeroPick(image: MediaImage | null) {
    if (image) rememberHeroUrl(image.id, image.url);
    handleFieldsChange({ heroImageId: image?.id ?? null });
  }

  function discardChanges() {
    if (!activeId || !activeBuffer) return;
    if (!isDirty) return;
    const ok = window.confirm(
      "Alle ungespeicherten Änderungen für diesen Beitrag verwerfen?",
    );
    if (!ok) return;
    setBuffers((prev) => {
      const cur = prev.get(activeId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(activeId, {
        detail: cur.detail,
        draft: cur.detail.Content,
        fields: fieldsFromPost(cur.detail),
      });
      return next;
    });
  }

  async function openPost(summary: PostSummary) {
    if (activeId === summary.documentId) return;
    if (buffers.has(summary.documentId)) {
      setActiveId(summary.documentId);
      return;
    }
    setLoadingPost(true);
    try {
      const full = await strapi.getPost(summary.documentId);
      if (!full) return;
      upsertBuffer(full);
      setActiveId(full.documentId);
    } finally {
      setLoadingPost(false);
    }
  }

  function handleDraftChange(value: string) {
    if (!activeId) return;
    setBuffers((prev) => {
      const cur = prev.get(activeId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(activeId, { ...cur, draft: value });
      return next;
    });
  }

  async function save(mode: SaveMode) {
    if (!activePost || !fields) return;
    if (blockingIssues.length > 0) {
      setSaveError(blockingIssues.map((i) => i.message).join(" "));
      return;
    }
    setSaving(true);
    setSavingMode(mode);
    setSaveError(null);
    try {
      if (contentDirty || fieldsDirty) {
        await strapi.saveDraft(activePost.documentId, {
          content: contentDirty ? draft : undefined,
          fields: fieldsDirty ? fields : undefined,
        });
      }
      if (mode === "publish") {
        // OverridePublishDate ist bei Strapi ein Pflichtfeld für den Publish und
        // darf nicht null sein. Der Feld-Editor ist die einzige Quelle dafür.
        await strapi.publish(activePost.documentId, fields.OverridePublishDate);
      }
      await refreshBuffer(activePost.documentId);
      setSaveOpen(false);
      void reload();
      // Slug-Liste nachziehen: ein umbenannter Beitrag darf nicht gleich wieder
      // mit seinem eigenen alten Slug kollidieren.
      void strapi.listSlugs().then(setAllSlugs).catch(() => undefined);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }

  async function createPost(title: string, slug: string) {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await strapi.createPost({
        Title: title,
        Slug: slug,
        Content: "",
      });
      upsertBuffer((await refreshBuffer(created.documentId)) ?? created);
      setActiveId(created.documentId);
      setNewOpen(false);
      // Der neue Beitrag soll beim nächsten Slug-Vergleich mitzählen.
      setAllSlugs((prev) => [...prev, slug]);
      // Bei einem frischen Beitrag sind die Felder das Erste, was gebraucht wird.
      setFieldsOpen(true);
      void reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  /**
   * Übersetzt den aktiven Beitrag und öffnet die neue englische Fassung.
   *
   * Der API-Key wandert nur an das eigene Backend (die CSP lässt Aufrufe an
   * api.anthropic.com aus dem Browser ohnehin nicht zu) und wird dort nicht
   * gespeichert.
   */
  async function translateActive(apiKey: string) {
    if (!activePost) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const { post, slug, warnings } = await strapi.translate(activePost.documentId, apiKey);
      // Wie beim Speichern: der Serverstand kommt über getPost, damit Autor,
      // Kategorien und Beitragsbild der Übersetzung im Puffer stehen.
      await refreshBuffer(post.documentId);
      setActiveId(post.documentId);
      setAllSlugs((prev) => [...prev, slug]);
      setTranslateOpen(false);
      setTranslateNotice(
        warnings.length
          ? `Englischer Entwurf „${slug}“ angelegt — aber: ${warnings.join(" ")}`
          : `Englischer Entwurf „${slug}“ angelegt und mit dem Original verknüpft.`,
      );
      void reload();
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranslating(false);
    }
  }

  function openSaveDialog() {
    if (!activePost) return;
    setSaveError(null);
    setSaveOpen(true);
  }

  function toggleSidebar() {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (activeId) openSaveDialog();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setNewOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setFieldsOpen((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <BrandeisLogo className={styles.brandLogo} />
          <span className={styles.brandText}>Blog Editor</span>
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Liste einblenden (Strg+B)" : "Liste ausblenden (Strg+B)"}
        >
          {sidebarCollapsed ? "☰" : "⟨"}
        </button>
        <div className={styles.topbarTitle}>
          {/* Titel aus dem Puffer, nicht aus dem Serverstand — sonst würde eine
              Umbenennung erst nach dem Speichern sichtbar. */}
          {fields ? fields.Title || "(ohne Titel)" : "Kein Beitrag ausgewählt"}
          {isDirty && <span className={styles.dirty}>● ungespeichert</span>}
          {blockingIssues.length > 0 && (
            <span className={styles.invalid} title={blockingIssues.map((i) => i.message).join("\n")}>
              ▲ {blockingIssues.length} Feldfehler
            </span>
          )}
        </div>
        <span className={styles.userPill} title={user.email}>
          {[user.firstname, user.lastname].filter(Boolean).join(" ") || user.username || user.email}
        </span>
        <button
          type="button"
          className={fieldsOpen ? styles.toggleBtnActive : styles.toggleBtn}
          onClick={() => setFieldsOpen((s) => !s)}
          disabled={!activePost}
          title="Autor, Banner, Datum, Kategorien, Template … bearbeiten (Strg+E)"
        >
          ⚙ Felder
          {fieldsDirty && <span className={styles.dot} />}
        </button>
        <button
          type="button"
          className={scrollSync ? styles.toggleBtnActive : styles.toggleBtn}
          onClick={() => setScrollSync((s) => !s)}
          title="Scroll synchronisieren"
        >
          ⇅ Sync
        </button>
        <button
          type="button"
          className={highlightChanges ? styles.toggleBtnActive : styles.toggleBtn}
          onClick={() => setHighlightChanges((s) => !s)}
          title="Geänderte Wörter in der Vorschau markieren"
        >
          ✎ Diff
        </button>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={onLogout}
          title="Abmelden"
        >
          Abmelden
        </button>
        <button
          type="button"
          className={styles.toggleBtn}
          disabled={!activePost || saving || translating || activePost?.Language === "Englisch"}
          onClick={() => {
            setTranslateError(null);
            setTranslateNotice(null);
            setTranslateOpen(true);
          }}
          title={
            activePost?.Language === "Englisch"
              ? "Der Beitrag ist bereits auf Englisch"
              : "Ins Englische übersetzen und als Entwurf anlegen"
          }
        >
          🌐 Übersetzen
        </button>
        <button
          type="button"
          className={styles.discardBtn}
          disabled={!isDirty || saving}
          onClick={discardChanges}
          title="Änderungen verwerfen und Server-Stand wiederherstellen"
        >
          Verwerfen
        </button>
        <button
          type="button"
          className={styles.publishBtn}
          disabled={!activePost || saving}
          onClick={openSaveDialog}
          title={isDirty ? "Speichern (Strg+S)" : "Veröffentlichen oder Entwurf speichern"}
        >
          {isDirty ? "Speichern" : "Veröffentlichen"}
        </button>
      </header>

      {translateNotice && (
        <div className={translateNotice.includes("aber:") ? `${styles.notice} ${styles.noticeWarn}` : styles.notice}>
          <span>{translateNotice}</span>
          <button type="button" onClick={() => setTranslateNotice(null)} title="Schließen">×</button>
        </div>
      )}

      <PanelGroup
        direction="horizontal"
        autoSaveId="brandeis-editor-layout-v1"
        className={styles.panels}
      >
        <Panel
          ref={sidebarRef}
          id="sidebar"
          order={1}
          collapsible
          collapsedSize={0}
          minSize={12}
          defaultSize={18}
          maxSize={40}
          onCollapse={() => setSidebarCollapsed(true)}
          onExpand={() => setSidebarCollapsed(false)}
        >
          <PostList
            posts={posts}
            selectedId={activeId}
            onSelect={openPost}
            loading={loading}
            error={error}
            onReload={reload}
            onNew={() => setNewOpen(true)}
            dirtyIds={dirtyIds}
          />
        </Panel>
        <PanelResizeHandle className={styles.handle} />
        <Panel id="editor" order={2} defaultSize={41} minSize={20}>
          <div className={styles.pane}>
            {loadingPost ? (
              <div className={styles.spinner}>Lade Beitrag…</div>
            ) : (
              <>
                {fieldsOpen && fields && (
                  <FieldsPanel
                    fields={fields}
                    onChange={handleFieldsChange}
                    categories={categories}
                    authors={authors}
                    optionsError={optionsError}
                    issues={issues}
                    heroUrl={heroUrl}
                    onHeroPick={handleHeroPick}
                    disabled={saving}
                  />
                )}
                <Editor value={draft} onChange={handleDraftChange} onCreateView={setEditorView} />
              </>
            )}
          </div>
        </Panel>
        <PanelResizeHandle className={styles.handle} />
        <Panel id="preview" order={3} defaultSize={41} minSize={20}>
          <div className={styles.pane}>
            <Preview
              post={activePost}
              fields={fields}
              categories={categories}
              authors={authors}
              heroUrl={heroUrl}
              draftContent={previewMarkdown}
              previewUrl={previewUrl}
              onFrameRef={(el) => {
                previewFrameRef.current = el;
              }}
            />
          </div>
        </Panel>
      </PanelGroup>

      <TranslateDialog
        open={translateOpen}
        busy={translating}
        error={translateError}
        postTitle={activePost?.Title ?? ""}
        onCancel={() => {
          setTranslateOpen(false);
          setTranslateError(null);
        }}
        onTranslate={translateActive}
      />

      <PublishDialog
        open={saveOpen}
        title={fields?.Title ?? activePost?.Title ?? ""}
        original={activePost?.Content ?? ""}
        draft={draft}
        fieldChanges={
          activeBuffer && fieldsDirty
            ? describeFieldChanges(fieldsFromPost(activeBuffer.detail), activeBuffer.fields, {
                categories,
                authors,
              })
            : []
        }
        blockingIssues={blockingIssues.map((i) => i.message)}
        saving={saving}
        savingMode={savingMode}
        error={saveError}
        overridePublishDate={fields?.OverridePublishDate ?? false}
        onOverridePublishDateChange={(v) => handleFieldsChange({ OverridePublishDate: v })}
        onCancel={() => {
          setSaveOpen(false);
          setSaveError(null);
        }}
        onSave={save}
      />

      <NewPostDialog
        open={newOpen}
        busy={creating}
        error={createError}
        onCancel={() => {
          setNewOpen(false);
          setCreateError(null);
        }}
        onCreate={createPost}
      />
    </div>
  );
}
