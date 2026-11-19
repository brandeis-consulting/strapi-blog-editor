import type { PreviewUpdateMessage } from "./previewPayload";

/**
 * Verbindung zwischen dem Editor und einem abgekoppelten Vorschaufenster.
 *
 * Das Vorschaufenster ist eine zweite Ansicht *dieses* Editors
 * (`/preview-window`), die nur den Vorschau-iframe enthält. Beide Fenster
 * liegen damit auf demselben Origin und reden über einen BroadcastChannel —
 * `window.opener` wird nicht gebraucht (Helmet setzt
 * `Cross-Origin-Opener-Policy: same-origin`, ein Popup direkt auf die
 * Gatsby-Seite wäre vom Editor aus gar nicht ansprechbar) und die Fenster
 * finden sich nach einem Neuladen von selbst wieder.
 *
 * Für die Gatsby-Seite ändert sich nichts: sie steckt weiterhin in einem
 * iframe des Editors und spricht mit `window.parent`.
 */

export const PREVIEW_WINDOW_PATH = "/preview-window";
/** Fenstername — ein zweiter Klick holt das offene Fenster nach vorn. */
export const PREVIEW_WINDOW_NAME = "brandeis-blog-preview";
/**
 * Web Lock, den das Vorschaufenster hält, solange es lebt. Der Editor wartet
 * darauf und erfährt so auch dann vom Ende des Fensters, wenn dessen
 * Abschiedsnachricht nicht mehr ankommt (Absturz, hartes Schließen).
 */
export const PREVIEW_WINDOW_LOCK = "brandeis-blog-preview-window";

const CHANNEL_NAME = "brandeis-blog-preview";

/** Editor → Vorschauseite. Der Vertrag mit blog-preview.js im Gatsby-Projekt. */
export type ToPreviewMessage =
  | PreviewUpdateMessage
  | { type: "preview-scroll-to"; ratio: number };

/** Vorschauseite → Editor. */
export type FromPreviewMessage =
  | { type: "preview-ready" }
  | { type: "preview-scroll"; ratio: number };

/** Was zwischen Editor und Vorschaufenster über den Kanal läuft. */
export type PreviewChannelMessage =
  /** Editor (neu) geladen: offene Vorschaufenster sollen sich melden. */
  | { type: "editor-hello" }
  /** Vorschaufenster steht bereit und möchte den aktuellen Entwurf. */
  | { type: "window-open" }
  | { type: "window-closed" }
  /** Editor holt die Vorschau zurück: das Fenster soll sich schließen. */
  | { type: "window-close" }
  | { type: "to-preview"; msg: ToPreviewMessage }
  | { type: "from-preview"; msg: FromPreviewMessage };

export interface PreviewChannel {
  post(msg: PreviewChannelMessage): void;
  close(): void;
}

/** `null`, wenn der Browser keinen BroadcastChannel kennt. */
export function openPreviewChannel(
  onMessage: (msg: PreviewChannelMessage) => void,
): PreviewChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => {
    const msg = event.data as PreviewChannelMessage | null;
    if (msg && typeof msg.type === "string") onMessage(msg);
  };
  return {
    post: (msg) => channel.postMessage(msg),
    close: () => channel.close(),
  };
}
