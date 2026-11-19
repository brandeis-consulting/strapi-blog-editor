import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import type { PreviewLink } from "./usePreviewLink";

/**
 * So lange nach dem letzten eigenen Scroll-Ereignis gehört die Bewegung noch
 * der Seite, die sie angestoßen hat.
 */
const RELEASE_MS = 120;

/**
 * Proportionaler Scroll-Sync zwischen CodeMirror und der Vorschau im iframe.
 *
 * Ersetzt useScrollSync für die iframe-Vorschau: die Vorschauseite liegt auf
 * einem anderen Origin, ihr `scrollTop` ist vom Editor aus weder lesbar noch
 * schreibbar. Beide Richtungen laufen deshalb über Nachrichten — der Editor
 * schickt ein Verhältnis (0…1), die Seite meldet ihres zurück. Der Weg dorthin
 * ist Sache des PreviewLink: direkt in den angedockten iframe oder über das
 * Vorschaufenster.
 *
 * Die Sperre ist aus demselben Grund nötig wie in useScrollSync: ohne sie
 * schaukelt sich Scroll → Nachricht → Scroll auf. Die Vorschauseite meldet
 * auch Bewegungen zurück, die wir selbst ausgelöst haben, und dieses Echo
 * kommt asynchron — über das Vorschaufenster mit zwei Stationen mehr. Die
 * Sperre hält deshalb eine kurze Ruhezeit lang statt nur einen Frame, sonst
 * zöge ein verspätetes Echo den Editor beim Scrollen zurück.
 */
export function useIframeScrollSync(
  editorView: EditorView | null,
  link: PreviewLink,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const editor = editorView?.scrollDOM;
    if (!editor) return;

    let activeSource: "editor" | "preview" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const release = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        activeSource = null;
      }, RELEASE_MS);
    };

    function onEditorScroll() {
      if (!editor || activeSource === "preview") return;
      activeSource = "editor";
      const max = editor.scrollHeight - editor.clientHeight;
      link.send({ type: "preview-scroll-to", ratio: max > 0 ? editor.scrollTop / max : 0 });
      release();
    }

    const unsubscribe = link.subscribe((msg) => {
      if (msg.type !== "preview-scroll" || typeof msg.ratio !== "number") return;
      if (!editor || activeSource === "editor") return;
      activeSource = "preview";
      const max = editor.scrollHeight - editor.clientHeight;
      if (max > 0) editor.scrollTop = max * msg.ratio;
      release();
    });

    editor.addEventListener("scroll", onEditorScroll, { passive: true });
    return () => {
      editor.removeEventListener("scroll", onEditorScroll);
      unsubscribe();
      clearTimeout(timer);
    };
  }, [editorView, link, enabled]);
}
