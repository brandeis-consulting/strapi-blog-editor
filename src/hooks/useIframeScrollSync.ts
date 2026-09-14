import { useEffect } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";

/**
 * Proportionaler Scroll-Sync zwischen CodeMirror und der Vorschau im iframe.
 *
 * Ersetzt useScrollSync für die iframe-Vorschau: die Vorschauseite liegt auf
 * einem anderen Origin, ihr `scrollTop` ist vom Editor aus weder lesbar noch
 * schreibbar. Beide Richtungen laufen deshalb über postMessage — der Editor
 * schickt ein Verhältnis (0…1), die Seite meldet ihres zurück.
 *
 * Die Ein-Frame-Sperre ist dieselbe wie in useScrollSync und aus demselben
 * Grund nötig: ohne sie schaukelt sich Scroll → Nachricht → Scroll auf.
 * Über die Nachrichtengrenze hinweg ist sie sogar wichtiger, weil die Antwort
 * asynchron zurückkommt.
 */
export function useIframeScrollSync(
  editorView: EditorView | null,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  targetOrigin: string | null,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !targetOrigin) return;
    const editor = editorView?.scrollDOM;
    if (!editor) return;

    let activeSource: "editor" | "preview" | null = null;
    let frame = 0;

    const release = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        activeSource = null;
      });
    };

    function onEditorScroll() {
      if (!editor || activeSource === "preview") return;
      activeSource = "editor";
      const max = editor.scrollHeight - editor.clientHeight;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "preview-scroll-to", ratio: max > 0 ? editor.scrollTop / max : 0 },
        targetOrigin!,
      );
      release();
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== targetOrigin) return;
      const msg = event.data as { type?: string; ratio?: number } | null;
      if (!msg || msg.type !== "preview-scroll" || typeof msg.ratio !== "number") return;
      if (!editor || activeSource === "editor") return;
      activeSource = "preview";
      const max = editor.scrollHeight - editor.clientHeight;
      if (max > 0) editor.scrollTop = max * msg.ratio;
      release();
    }

    editor.addEventListener("scroll", onEditorScroll, { passive: true });
    window.addEventListener("message", onMessage);
    return () => {
      editor.removeEventListener("scroll", onEditorScroll);
      window.removeEventListener("message", onMessage);
      cancelAnimationFrame(frame);
    };
  }, [editorView, iframeRef, targetOrigin, enabled]);
}
