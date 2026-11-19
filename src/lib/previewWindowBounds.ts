/**
 * Position und Größe des Vorschaufensters, über Sitzungen hinweg gemerkt.
 *
 * Das Vorschaufenster schreibt seine Lage laufend in den localStorage, der
 * Editor liest sie beim nächsten Öffnen und gibt sie `window.open` mit. Beide
 * liegen auf demselben Origin, deshalb teilen sie sich den Speicher.
 */

const STORAGE_KEY = "brandeis-blog-preview-window-bounds";
const DEFAULT_FEATURES = "popup,width=1100,height=900";

export interface WindowBounds {
  /** Linke obere Ecke des Fensters in Bildschirmkoordinaten (über alle Monitore). */
  left: number;
  top: number;
  /** Größe des Inhaltsbereichs — das, was `window.open` unter width/height versteht. */
  width: number;
  height: number;
}

/** Was hier nicht deklariert ist, kennt lib.dom nicht (Window Management API). */
type ScreenWithExtras = Screen & {
  isExtended?: boolean;
  availLeft?: number;
  availTop?: number;
};
type WindowWithScreenDetails = Window & { getScreenDetails?: () => Promise<unknown> };

export function loadWindowBounds(): WindowBounds | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<WindowBounds> | null;
    if (!b) return null;
    const values = [b.left, b.top, b.width, b.height];
    if (!values.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    // Ein zusammengeschobenes Fenster soll nicht als Briefmarke wiederkommen.
    if (b.width! < 300 || b.height! < 200) return null;
    return { left: b.left!, top: b.top!, width: b.width!, height: b.height! };
  } catch {
    // localStorage gesperrt oder Inhalt kaputt — dann eben die Standardlage.
    return null;
  }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // Ohne Speicher gibt es kein Merken; das Fenster funktioniert trotzdem.
  }
}

/** Lage des Fensters, in dem dieser Code läuft. */
export function currentWindowBounds(): WindowBounds {
  return {
    left: window.screenX,
    top: window.screenY,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/** Der dritte Parameter für `window.open`. */
export function windowFeatures(bounds: WindowBounds | null): string {
  if (!bounds) return DEFAULT_FEATURES;
  const { left, top, width, height } = bounds;
  return `popup,left=${Math.round(left)},top=${Math.round(top)},width=${Math.round(width)},height=${Math.round(height)}`;
}

/** Liegt die gemerkte Lage auf dem Bildschirm, auf dem dieses Fenster steht? */
function isOnCurrentScreen(bounds: WindowBounds): boolean {
  const s = window.screen as ScreenWithExtras;
  const left = s.availLeft ?? 0;
  const top = s.availTop ?? 0;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  return (
    centerX >= left &&
    centerX < left + s.availWidth &&
    centerY >= top &&
    centerY < top + s.availHeight
  );
}

/**
 * Schiebt das frisch geöffnete Vorschaufenster auf den Monitor, auf dem es
 * zuletzt stand.
 *
 * Nötig ist das nur in Chromium (Chrome, Edge): dort landet ein Fenster ohne
 * die Berechtigung „Fensterverwaltung" immer auf dem Bildschirm des Editors,
 * egal welche Koordinaten `window.open` bekommt. `getScreenDetails()` fragt
 * die Berechtigung an — beim ersten Mal mit einer Rückfrage des Browsers,
 * danach still. Ist sie erteilt, darf `moveTo` über Bildschirmgrenzen hinweg.
 *
 * Bewusst *nach* dem Öffnen: die Rückfrage kann beliebig lange offen bleiben,
 * und ein `window.open` nach einer abgelaufenen Nutzergeste würde der
 * Popup-Blocker schlucken. So steht das Fenster sofort da und zieht um,
 * sobald es darf.
 */
export async function moveToSavedScreen(win: Window, bounds: WindowBounds): Promise<void> {
  const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
  if (!getScreenDetails) return;
  if (!(window.screen as ScreenWithExtras).isExtended) return;
  // Gleicher Bildschirm: das hat `window.open` schon selbst erledigt, und eine
  // Rückfrage nach der Berechtigung wäre grundlos.
  if (isOnCurrentScreen(bounds)) return;
  try {
    await getScreenDetails.call(window);
    if (!win.closed) win.moveTo(Math.round(bounds.left), Math.round(bounds.top));
  } catch {
    // Berechtigung abgelehnt: das Fenster bleibt auf dem Bildschirm des Editors.
  }
}
