import { diffWords } from "diff";

const MARK_OPEN = '<mark class="diff-added">';

/**
 * Wrap word-level additions with <mark> so the preview highlights what is new.
 * Lines inside fenced code blocks are skipped to avoid breaking syntax
 * highlighting and to keep the diff readable; marks that would break GFM
 * table parsing are stripped as well.
 */
export function annotateAddedWords(original: string, draft: string): string {
  const parts = diffWords(original, draft);
  const out = parts
    .filter((p) => !p.removed)
    .map((p) => (p.added ? markPerLine(p.value) : p.value))
    .join("");
  return stripMarksBreakingTables(stripMarksInsideCodeFences(out));
}

/**
 * Wrap each line of an added chunk separately: a <mark> spanning a line break
 * would otherwise glue block constructs (paragraphs, tables, lists) together.
 */
function markPerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${MARK_OPEN}${line}</mark>` : line))
    .join("\n");
}

function stripMarks(line: string): string {
  return line
    .replace(/<mark class="diff-added">/g, "")
    .replace(/<\/mark>/g, "");
}

function stripMarksInsideCodeFences(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    // Detect fences on the mark-free line, otherwise a freshly added
    // ```-line (wrapped in <mark>) is not recognized as a fence at all.
    const stripped = stripMarks(lines[i]);
    if (/^\s{0,3}```/.test(stripped)) {
      lines[i] = stripped;
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      lines[i] = stripped;
    }
  }
  return lines.join("\n");
}

const TABLE_DELIMITER_ROW = /^\s{0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * GFM tables break when a <mark> touches the line structure: a tag before the
 * first pipe or inside the delimiter row prevents the whole table from being
 * recognized. Marks inside a cell are harmless and stay (single edited words
 * in tables remain highlighted); only structure-breaking marks are stripped.
 */
function stripMarksBreakingTables(md: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripMarks(lines[i]);
    if (stripped === lines[i] || !stripped.includes("|")) continue;
    const breaksDelimiterRow = TABLE_DELIMITER_ROW.test(stripped);
    const markBeforeFirstPipe =
      lines[i].trimStart().startsWith(MARK_OPEN) &&
      stripped.trimStart().startsWith("|");
    if (breaksDelimiterRow || markBeforeFirstPipe) {
      lines[i] = stripped;
    }
  }
  return lines.join("\n");
}
