import { useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { strapi } from "../api/strapi";
import { Toolbar } from "./Toolbar";
import { insertLink, wrapInline } from "../lib/editorCommands";
import styles from "./Editor.module.scss";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCreateView?: (view: EditorView) => void;
}

/**
 * Tastenkürzel der Formatierleiste.
 *
 * `stopPropagation` ist hier wesentlich, nicht bloß sauber: Die AppShell hört
 * auf `window` mit und belegt Strg+B mit dem Ein-/Ausblenden der Seitenleiste.
 * Ohne das Stoppen würde ein Strg+B im Text gleichzeitig fett setzen **und** die
 * Liste umschalten. Wer im Editor tippt, meint die Formatierung; außerhalb
 * bleibt das Kürzel der Seitenleiste erhalten.
 */
const shortcuts = EditorView.domEventHandlers({
  keydown(event, view) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
    const key = event.key.toLowerCase();
    if (key === "b") wrapInline(view, "**");
    else if (key === "i") wrapInline(view, "*");
    else if (key === "k") insertLink(view);
    else return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  },
});

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-scroller": { fontFamily: "'JetBrains Mono', Consolas, monospace", lineHeight: "1.5" },
});

/**
 * Replace a placeholder string inside the editor with a final string, regardless
 * of how much the user typed in the meantime.
 */
function replaceFirst(view: EditorView, placeholder: string, replacement: string): boolean {
  const doc = view.state.doc.toString();
  const idx = doc.indexOf(placeholder);
  if (idx < 0) return false;
  view.dispatch({
    changes: { from: idx, to: idx + placeholder.length, insert: replacement },
  });
  return true;
}

function makePlaceholder(): string {
  return `![Bild wird hochgeladen … (${Math.random().toString(36).slice(2, 8)})]()`;
}

function fileFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

export function Editor({ value, onChange, onCreateView }: Props) {
  const viewRef = useRef<EditorView | null>(null);
  // Zusätzlich als State, damit die Toolbar neu rendert, sobald die Sicht da ist —
  // eine Ref allein löst kein Rendern aus und die Knöpfe blieben deaktiviert.
  const [view, setView] = useState<EditorView | null>(null);

  function handleCreate(v: EditorView) {
    viewRef.current = v;
    setView(v);
    onCreateView?.(v);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const view = viewRef.current;
    if (!view) return;
    const file = fileFromClipboard(e.nativeEvent);
    if (!file) return;

    e.preventDefault();
    e.stopPropagation();

    const placeholder = makePlaceholder();
    const head = view.state.selection.main.head;
    view.dispatch({ changes: { from: head, insert: placeholder } });

    strapi
      .uploadImage(file)
      .then((uploaded) => {
        const alt = uploaded.name.replace(/\.[^.]+$/, "");
        const finalMd = `![${alt}](${uploaded.url})`;
        if (!replaceFirst(view, placeholder, finalMd)) {
          // Placeholder no longer present (user deleted it) — just append.
          const end = view.state.doc.length;
          view.dispatch({ changes: { from: end, insert: `\n${finalMd}\n` } });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const failure = `![Upload fehlgeschlagen: ${msg}]()`;
        replaceFirst(view, placeholder, failure);
      });
  }

  return (
    <div className={styles.editor} onPaste={handlePaste}>
      <Toolbar view={view} disabled={false} />
      <div className={styles.cmWrap}>
        <CodeMirror
          value={value}
          onChange={onChange}
          height="100%"
          theme={oneDark}
          extensions={[markdown({ codeLanguages: languages }), theme, shortcuts, EditorView.lineWrapping]}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
          }}
          onCreateEditor={handleCreate}
        />
      </div>
    </div>
  );
}
