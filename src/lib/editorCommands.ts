import type { EditorView } from "@codemirror/view";

/**
 * Bearbeitungsbefehle der Toolbar, als Transaktionen auf der CodeMirror-Sicht.
 *
 * Alle Befehle geben den Fokus an den Editor zurück — ein Knopfdruck soll den
 * Schreibfluss nicht unterbrechen. Und alle setzen die Auswahl anschließend
 * sinnvoll: Wer auf „Fett" drückt, ohne etwas markiert zu haben, landet zwischen
 * den Sternchen und kann direkt lostippen.
 */

/** Position, an der der Cursor nach dem Einfügen stehen soll. */
const CURSOR = "‸"; // ‸ — im Markdown selbst nie zu erwarten

/**
 * Text um die Auswahl legen — oder wieder entfernen, wenn er schon da ist.
 *
 * Das Entfernen prüft **außerhalb** der Auswahl: Wer ein fett gesetztes Wort per
 * Doppelklick markiert, hat die Sternchen nicht mit ausgewählt. Ohne diese
 * Prüfung würde ein zweiter Druck auf „Fett" vier Sternchen erzeugen statt zwei
 * zu entfernen.
 */
export function wrapInline(view: EditorView, before: string, after = before): void {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const outerFrom = Math.max(0, from - before.length);
  const outerTo = Math.min(doc.length, to + after.length);
  const lead = doc.sliceString(outerFrom, from);
  const trail = doc.sliceString(to, outerTo);

  if (lead === before && trail === after) {
    view.dispatch({
      changes: [
        { from: outerFrom, to: from, insert: "" },
        { from: to, to: outerTo, insert: "" },
      ],
      selection: { anchor: outerFrom, head: outerFrom + (to - from) },
    });
    view.focus();
    return;
  }

  view.dispatch({
    changes: [
      { from, insert: before },
      { from: to, insert: after },
    ],
    selection: { anchor: from + before.length, head: to + before.length },
  });
  view.focus();
}

/**
 * Zeilenpräfix setzen oder entfernen (Listen, Zitate, Überschriften).
 *
 * Wirkt auf alle Zeilen der Auswahl. Tragen bereits **alle** das Präfix, wird es
 * entfernt — sonst bekommen es die fehlenden. So verhält sich ein zweiter Druck
 * wie ein Rücknehmen und nicht wie ein Verdoppeln.
 *
 * `ordered` nummeriert stattdessen durch.
 */
export function toggleLinePrefix(view: EditorView, prefix: string, ordered = false): void {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const first = doc.lineAt(from).number;
  const last = doc.lineAt(to).number;

  const lines = [];
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    // Leerzeilen auslassen: Ein Listenpunkt ohne Inhalt ergibt keinen Sinn, und
    // bei der Nummerierung verschöbe er alles dahinter (aus zwei Absätzen wurde
    // sonst „1., 2. (leer), 3."). Ausnahme: Steht der Cursor auf einer einzelnen
    // leeren Zeile, ist genau das gemeint — dort eine Liste beginnen.
    if (line.text.trim() !== "" || first === last) lines.push(line);
  }
  if (lines.length === 0) return;

  const matcher = ordered ? /^\d+\.\s/ : new RegExp(`^${escapeRegExp(prefix)}`);
  const allSet = lines.every((l) => matcher.test(l.text));

  const changes = lines.map((line, i) => {
    if (allSet) {
      const hit = matcher.exec(line.text);
      return { from: line.from, to: line.from + (hit?.[0].length ?? 0), insert: "" };
    }
    // Ein vorhandenes Präfix anderer Art zuerst weichen lassen, sonst entsteht
    // „- 1. Text" beim Wechsel zwischen den Listenarten.
    const existing = /^(\d+\.\s|[-*+]\s|>\s?|#{1,6}\s)/.exec(line.text);
    return {
      from: line.from,
      to: line.from + (existing?.[0].length ?? 0),
      insert: ordered ? `${i + 1}. ` : prefix,
    };
  });

  view.dispatch({ changes });
  view.focus();
}

/**
 * Baustein als eigenen Block einfügen.
 *
 * Leerzeilen davor und danach sind hier keine Kosmetik: Markdown behandelt den
 * Inhalt eines Block-HTML-Elements nur dann als Markdown, wenn er durch
 * Leerzeilen davon getrennt ist. Ohne sie käme in `<masonry-layout>` roher Text
 * statt der Bilder an, die das Element erwartet.
 *
 * `‸` im Baustein markiert, wo der Cursor landen soll.
 */
export function insertBlock(view: EditorView, snippet: string): void {
  const line = view.state.doc.lineAt(view.state.selection.main.to);

  // Auf einer leeren Zeile dort einfügen, sonst hinter der aktuellen Zeile mit
  // einer Leerzeile dazwischen. Eine markierte Stelle wird bewusst nicht
  // ersetzt — ein Baustein ergänzt, er überschreibt nicht.
  const onEmptyLine = line.text.trim() === "";
  const insertAt = onEmptyLine ? line.from : line.to;
  const lead = onEmptyLine ? "" : "\n\n";

  const cursorInBody = snippet.indexOf(CURSOR);
  const body = snippet.replace(CURSOR, "");

  // Der Block braucht auch *hinter* sich eine Leerzeile, sonst zieht Markdown
  // den Folgeabsatz noch in das HTML-Element hinein. Steht dort schon eine,
  // wird keine zweite gesetzt — sonst klafften Lücken im Text.
  const doc = view.state.doc;
  const following = doc.sliceString(insertAt, Math.min(doc.length, insertAt + 2));
  const tail = insertAt >= doc.length ? "\n" : following.startsWith("\n\n") ? "" : "\n";

  view.dispatch({
    changes: { from: insertAt, insert: `${lead}${body}${tail}` },
    selection: {
      anchor: insertAt + lead.length + (cursorInBody >= 0 ? cursorInBody : body.length),
    },
  });
  view.focus();
}

/** Link einfügen — mit markiertem Text als Beschriftung, falls vorhanden. */
export function insertLink(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const label = view.state.doc.sliceString(from, to) || "Beschriftung";
  const text = `[${label}](https://)`;
  view.dispatch({
    changes: { from, to, insert: text },
    // Cursor hinter „https://", damit die Adresse direkt eingetippt werden kann.
    selection: { anchor: from + text.length - 1 },
  });
  view.focus();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { CURSOR };
