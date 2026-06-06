import { useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { strapi } from "../api/strapi";
import styles from "./Editor.module.scss";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCreateView?: (view: EditorView) => void;
}

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

  function handleCreate(view: EditorView) {
    viewRef.current = view;
    onCreateView?.(view);
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
      <CodeMirror
        value={value}
        onChange={onChange}
        height="100%"
        theme={oneDark}
        extensions={[markdown({ codeLanguages: languages }), theme, EditorView.lineWrapping]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
        }}
        onCreateEditor={handleCreate}
      />
    </div>
  );
}
