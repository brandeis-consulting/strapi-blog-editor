import { useEffect } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";

/**
 * Proportional scroll-sync between CodeMirror editor and an HTML preview.
 * Uses a one-frame guard to avoid the cyclic scroll → scroll → … loop.
 */
export function useScrollSync(
  editorView: EditorView | null,
  previewRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const editor = editorView?.scrollDOM;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    let activeSource: "editor" | "preview" | null = null;
    let frame = 0;

    function syncProportional(from: HTMLElement, to: HTMLElement) {
      const fromMax = from.scrollHeight - from.clientHeight;
      const toMax = to.scrollHeight - to.clientHeight;
      if (fromMax <= 0 || toMax <= 0) return;
      to.scrollTop = (from.scrollTop / fromMax) * toMax;
    }

    function onEditorScroll() {
      if (!editor || !preview) return;
      if (activeSource === "preview") return;
      activeSource = "editor";
      syncProportional(editor, preview);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        activeSource = null;
      });
    }
    function onPreviewScroll() {
      if (!editor || !preview) return;
      if (activeSource === "editor") return;
      activeSource = "preview";
      syncProportional(preview, editor);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        activeSource = null;
      });
    }

    editor.addEventListener("scroll", onEditorScroll, { passive: true });
    preview.addEventListener("scroll", onPreviewScroll, { passive: true });
    return () => {
      editor.removeEventListener("scroll", onEditorScroll);
      preview.removeEventListener("scroll", onPreviewScroll);
      cancelAnimationFrame(frame);
    };
  }, [editorView, previewRef, enabled]);
}
