import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
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

export function Editor({ value, onChange, onCreateView }: Props) {
  return (
    <div className={styles.editor}>
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
        onCreateEditor={(view) => onCreateView?.(view)}
      />
    </div>
  );
}
