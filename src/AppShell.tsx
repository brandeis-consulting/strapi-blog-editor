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
import type { PostDetail, PostSummary, SessionUser } from "./types";
import { usePosts } from "./hooks/usePosts";
import { useDebounced } from "./hooks/useDebounced";
import { useScrollSync } from "./hooks/useScrollSync";
import { PostList } from "./components/PostList";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { PublishDialog, type SaveMode } from "./components/PublishDialog";
import { NewPostDialog } from "./components/NewPostDialog";
import styles from "./styles/app.module.scss";

const STRAPI_HOST = "https://cms.brandeis.de";

interface Props {
  user: SessionUser;
  onLogout: () => void;
}

/**
 * Per-post buffer that caches both the last server state and the in-progress
 * draft. Keeps unsaved edits intact when switching between posts.
 */
interface PostBuffer {
  detail: PostDetail;
  draft: string;
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
  const [overridePublishDate, setOverridePublishDate] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scrollSync, setScrollSync] = useState(true);
  const [highlightChanges, setHighlightChanges] = useState(true);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const activeBuffer = activeId ? buffers.get(activeId) ?? null : null;
  const activePost = activeBuffer?.detail ?? null;
  const draft = activeBuffer?.draft ?? "";
  const debouncedDraft = useDebounced(draft, 150);

  const previewMarkdown = useMemo(() => {
    if (!highlightChanges || !activePost) return debouncedDraft;
    if (activePost.Content === debouncedDraft) return debouncedDraft;
    return annotateAddedWords(activePost.Content, debouncedDraft);
  }, [highlightChanges, activePost, debouncedDraft]);

  useScrollSync(editorView, previewRef, scrollSync);

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, buf] of buffers) {
      if (buf.draft !== buf.detail.Content) set.add(id);
    }
    return set;
  }, [buffers]);

  const isDirty = activeId ? dirtyIds.has(activeId) : false;

  function upsertBuffer(detail: PostDetail, draft?: string): void {
    setBuffers((prev) => {
      const next = new Map(prev);
      next.set(detail.documentId, { detail, draft: draft ?? detail.Content });
      return next;
    });
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
      next.set(activeId, { detail: cur.detail, draft: cur.detail.Content });
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
    if (!activePost) return;
    setSaving(true);
    setSavingMode(mode);
    setSaveError(null);
    try {
      let updated = activePost;
      if (isDirty) {
        updated = await strapi.saveDraft(activePost.documentId, draft);
      }
      if (mode === "publish") {
        updated = await strapi.publish(activePost.documentId, overridePublishDate);
      }
      upsertBuffer(updated, updated.Content);
      setSaveOpen(false);
      void reload();
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
      upsertBuffer(created);
      setActiveId(created.documentId);
      setNewOpen(false);
      void reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  function openSaveDialog() {
    if (!activePost) return;
    setOverridePublishDate(activePost.OverridePublishDate ?? false);
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
          {activePost ? activePost.Title : "Kein Beitrag ausgewählt"}
          {isDirty && <span className={styles.dirty}>● ungespeichert</span>}
        </div>
        <span className={styles.userPill} title={user.email}>
          {[user.firstname, user.lastname].filter(Boolean).join(" ") || user.username || user.email}
        </span>
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
              <Editor value={draft} onChange={handleDraftChange} onCreateView={setEditorView} />
            )}
          </div>
        </Panel>
        <PanelResizeHandle className={styles.handle} />
        <Panel id="preview" order={3} defaultSize={41} minSize={20}>
          <div className={styles.pane}>
            <Preview
              post={activePost}
              draftContent={previewMarkdown}
              strapiHost={STRAPI_HOST}
              scrollRef={previewRef}
            />
          </div>
        </Panel>
      </PanelGroup>

      <PublishDialog
        open={saveOpen}
        title={activePost?.Title ?? ""}
        original={activePost?.Content ?? ""}
        draft={draft}
        saving={saving}
        savingMode={savingMode}
        error={saveError}
        overridePublishDate={overridePublishDate}
        onOverridePublishDateChange={setOverridePublishDate}
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
