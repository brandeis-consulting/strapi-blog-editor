import type { EditorView } from "@codemirror/view";
import { CURSOR, insertBlock, insertLink, toggleLinePrefix, wrapInline } from "../lib/editorCommands";
import styles from "./Toolbar.module.scss";

interface Props {
  view: EditorView | null;
  disabled: boolean;
}

/**
 * Bausteine aus dem Bestand der Website.
 *
 * Die drei Layout-Elemente sind echte Custom Elements, definiert in
 * brandeis-academy/src/scripts/custom_style.script.js — sie werden dort per
 * `customElements.define` registriert und bauen ihren Inhalt beim Einhängen um.
 * Ändern sich ihre Attribute, gehört das hier nachgezogen.
 *
 * **Die Leerzeilen im Inneren sind Pflicht, nicht Geschmack.** Markdown behandelt
 * den Inhalt eines Block-HTML-Elements nur dann als Markdown, wenn er durch
 * Leerzeilen davon getrennt ist. Ohne sie käme in `<masonry-layout>` roher Text
 * an statt der `<img>`-Elemente, die es erwartet — und das Layout bliebe leer.
 */
const BLOCKS: Array<{ group: string; label: string; hint: string; snippet: string }> = [
  {
    group: "Struktur",
    label: "Inhaltsverzeichnis",
    hint: "[toc] — erzeugt das Sprungmenü aus den folgenden Überschriften",
    snippet: "[toc]",
  },
  {
    group: "Struktur",
    label: "Anker an Überschrift",
    hint: "{#eigener-name} — überschreibt den automatisch erzeugten Ankernamen",
    snippet: `## Überschrift {#${CURSOR}eigener-name}`,
  },
  {
    group: "Layout",
    label: "Masonry (versetzte Kacheln)",
    hint: "<masonry-layout columns> — Bilder versetzt, alt-Text wird zur Bildunterschrift. In der Newsletter-Mail stehen sie untereinander (Layout per JavaScript, Mail-Clients führen keins aus)",
    snippet: `<masonry-layout columns="3">\n\n![${CURSOR}Bildunterschrift](url)\n\n![Bildunterschrift](url)\n\n</masonry-layout>`,
  },
  {
    group: "Layout",
    label: "Raster (gleichmäßig)",
    hint: "<grid-layout columns> — gleich große Spalten. In der Newsletter-Mail untereinander",
    snippet: `<grid-layout columns="2">\n\n![${CURSOR}Bildunterschrift](url)\n\n![Bildunterschrift](url)\n\n</grid-layout>`,
  },
  {
    group: "Layout",
    label: "Zeile (nebeneinander)",
    hint: "<row-layout> — Inhalte nebeneinander. In der Newsletter-Mail untereinander",
    snippet: `<row-layout>\n\n${CURSOR}Erster Inhalt\n\nZweiter Inhalt\n\n</row-layout>`,
  },
  {
    group: "Hinweise",
    label: "KI-Kennzeichnung",
    hint: "<ai-label /> — Flags: text, images, videos, audios, dark",
    snippet: `<ai-label text${CURSOR} />`,
  },
  {
    group: "Hinweise",
    label: "Infokasten",
    hint: '<div class="info"> — gelb hinterlegter Hinweis',
    snippet: `<div class="info">\n\n${CURSOR}Hinweistext\n\n</div>`,
  },
];

/**
 * Formatierleiste über dem Markdown-Editor.
 *
 * Bewusst ohne Icon-Bibliothek: ein paar Zeichen und Kürzel tun es, und eine
 * weitere Abhängigkeit für zwölf Knöpfe wäre unverhältnismäßig.
 *
 * Nach jedem Befehl geht der Fokus zurück in den Editor (siehe editorCommands) —
 * sonst müsste man nach jedem Knopfdruck erst wieder hineinklicken.
 */
export function Toolbar({ view, disabled }: Props) {
  const off = disabled || !view;

  const btn = (label: string, title: string, action: (v: EditorView) => void, extra?: string) => (
    <button
      type="button"
      className={extra ? `${styles.btn} ${extra}` : styles.btn}
      title={title}
      disabled={off}
      // onMouseDown statt onClick: Ein Klick nähme dem Editor sonst zuerst den
      // Fokus, und die Auswahl, auf die sich der Befehl bezieht, wäre weg.
      onMouseDown={(e) => {
        e.preventDefault();
        if (view) action(view);
      }}
    >
      {label}
    </button>
  );

  const groups = [...new Set(BLOCKS.map((b) => b.group))];

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatierung">
      {btn("B", "Fett (Strg+B)", (v) => wrapInline(v, "**"), styles.bold)}
      {btn("I", "Kursiv (Strg+I)", (v) => wrapInline(v, "*"), styles.italic)}
      {btn("S", "Durchgestrichen", (v) => wrapInline(v, "~~"), styles.strike)}
      {btn("<>", "Code", (v) => wrapInline(v, "`"), styles.mono)}
      {btn("🔗", "Link (Strg+K)", insertLink)}

      <span className={styles.sep} />

      {btn("H2", "Überschrift 2", (v) => toggleLinePrefix(v, "## "))}
      {btn("H3", "Überschrift 3", (v) => toggleLinePrefix(v, "### "))}
      {btn("•", "Aufzählung", (v) => toggleLinePrefix(v, "- "))}
      {btn("1.", "Nummerierte Liste", (v) => toggleLinePrefix(v, "", true))}
      {btn("❝", "Zitat", (v) => toggleLinePrefix(v, "> "))}

      <span className={styles.sep} />

      {btn("⌗", "Codeblock", (v) => insertBlock(v, `\`\`\`abap\n${CURSOR}\n\`\`\``), styles.mono)}
      {btn("▦", "Tabelle", (v) =>
        insertBlock(v, `| ${CURSOR}Spalte | Spalte |\n| --- | --- |\n| Wert | Wert |`),
      )}
      {btn("―", "Trennlinie", (v) => insertBlock(v, "---"))}

      <span className={styles.sep} />

      <select
        className={styles.select}
        disabled={off}
        value=""
        title="Fertige Bausteine aus dem Bestand der Website"
        onChange={(e) => {
          const block = BLOCKS.find((b) => b.label === e.target.value);
          if (block && view) insertBlock(view, block.snippet);
          e.target.value = "";
        }}
      >
        <option value="">Baustein einfügen …</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {BLOCKS.filter((b) => b.group === g).map((b) => (
              <option key={b.label} value={b.label} title={b.hint}>
                {b.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
