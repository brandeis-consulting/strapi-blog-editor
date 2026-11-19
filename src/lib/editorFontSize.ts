/**
 * Schriftgröße des Markdown-Editors — pro Browser gemerkt, nicht pro Beitrag.
 */

const STORAGE_KEY = "brandeis-blog-editor-font-size";

export const FONT_SIZE_DEFAULT = 14;
// Die Grenzen sind kein Geschmack, sondern Schutz vor Vertippern: bei „1" oder
// „400" wäre das Feld, mit dem man es korrigieren könnte, selbst kaum bedienbar.
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 48;

/** Zwingt den Wert in die Grenzen und auf eine Nachkommastelle. */
export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return FONT_SIZE_DEFAULT;
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
  return Math.round(clamped * 10) / 10;
}

export function loadFontSize(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? FONT_SIZE_DEFAULT : clampFontSize(Number(raw));
  } catch {
    return FONT_SIZE_DEFAULT;
  }
}

export function saveFontSize(value: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ohne Speicher gilt die Größe eben nur bis zum Neuladen.
  }
}
