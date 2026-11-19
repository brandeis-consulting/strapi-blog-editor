import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PREVIEW_WINDOW_LOCK,
  PREVIEW_WINDOW_NAME,
  PREVIEW_WINDOW_PATH,
  openPreviewChannel,
  type FromPreviewMessage,
  type PreviewChannel,
  type ToPreviewMessage,
} from "../lib/previewChannel";

/**
 * Der Draht zur Vorschauseite — egal, ob sie gerade im Editor angedockt ist
 * oder in einem eigenen Fenster läuft. Wer senden oder zuhören will (Entwurf,
 * Scroll-Sync), muss den Unterschied nicht kennen.
 */
export interface PreviewLink {
  send(msg: ToPreviewMessage): void;
  /** Liefert die Abmelde-Funktion zurück. */
  subscribe(listener: (msg: FromPreviewMessage) => void): () => void;
}

/**
 * Verwaltet die Verbindung zur Vorschau im Editor-Fenster.
 *
 * Angedockt läuft alles per postMessage direkt in den iframe. Abgekoppelt
 * (`detached`) gehen dieselben Nachrichten über den BroadcastChannel an das
 * Vorschaufenster, das sie an seinen iframe weiterreicht.
 *
 * Ob ein Vorschaufenster offen ist, sagt das Fenster selbst — nicht der Klick
 * auf den Knopf. Deshalb überlebt der Zustand ein Neuladen beider Seiten.
 */
export function usePreviewLink(origin: string | null) {
  const [detached, setDetachedState] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  // Zählt hoch, wenn ein Vorschaufenster (neu) dazukommt und den Entwurf braucht.
  const [resync, setResync] = useState(0);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const channelRef = useRef<PreviewChannel | null>(null);
  const detachedRef = useRef(false);
  const listenersRef = useRef(new Set<(msg: FromPreviewMessage) => void>());

  const setDetached = useCallback((value: boolean) => {
    detachedRef.current = value;
    setDetachedState(value);
  }, []);

  const emit = useCallback((msg: FromPreviewMessage) => {
    listenersRef.current.forEach((listener) => listener(msg));
  }, []);

  // Kanal zum Vorschaufenster.
  useEffect(() => {
    const channel = openPreviewChannel((msg) => {
      switch (msg.type) {
        case "window-open":
          setDetached(true);
          setResync((n) => n + 1);
          // Den Lock bekommen wir erst, wenn das Fenster weg ist. `locks` fehlt
          // außerhalb sicherer Kontexte — dann bleibt die Abschiedsnachricht.
          void navigator.locks?.request(PREVIEW_WINDOW_LOCK, () => setDetached(false));
          break;
        case "window-closed":
          setDetached(false);
          break;
        case "from-preview":
          if (detachedRef.current) emit(msg.msg);
          break;
      }
    });
    channelRef.current = channel;
    // Ein Fenster, das schon vor uns da war (Editor neu geladen), meldet sich.
    channel?.post({ type: "editor-hello" });
    return () => {
      channel?.close();
      channelRef.current = null;
    };
  }, [setDetached, emit]);

  // Nachrichten des angedockten iframes.
  useEffect(() => {
    if (!origin) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data as FromPreviewMessage | null;
      if (!msg || typeof msg.type !== "string") return;
      // Die Seite meldet sich, sobald ihr Listener steht. Vorher gesendete
      // Nachrichten würden ins Leere laufen.
      if (msg.type === "preview-ready") setFrameReady(true);
      emit(msg);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, emit]);

  const setFrame = useCallback((frame: HTMLIFrameElement | null) => {
    frameRef.current = frame;
    // Ein neu eingehängter iframe muss sich erst wieder melden.
    if (!frame) setFrameReady(false);
  }, []);

  const send = useCallback(
    (msg: ToPreviewMessage) => {
      if (detachedRef.current) channelRef.current?.post({ type: "to-preview", msg });
      else if (origin) frameRef.current?.contentWindow?.postMessage(msg, origin);
    },
    [origin],
  );

  const subscribe = useCallback((listener: (msg: FromPreviewMessage) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const link = useMemo<PreviewLink>(() => ({ send, subscribe }), [send, subscribe]);

  const openWindow = useCallback(() => {
    const win = window.open(
      PREVIEW_WINDOW_PATH,
      PREVIEW_WINDOW_NAME,
      "popup,width=1100,height=900",
    );
    if (!win) {
      window.alert(
        "Der Browser hat das Vorschaufenster blockiert. Bitte Popups für diese Seite erlauben.",
      );
    }
  }, []);

  const closeWindow = useCallback(() => {
    channelRef.current?.post({ type: "window-close" });
    setDetached(false);
  }, [setDetached]);

  return {
    link,
    /** Die Vorschau läuft in einem eigenen Fenster. */
    detached,
    /** Der angedockte iframe hat sich gemeldet. */
    frameReady,
    /** Nachrichten kommen an — beim Fenster puffert die Gegenseite selbst. */
    live: detached || frameReady,
    resync,
    /** Ohne BroadcastChannel gibt es kein zweites Fenster. */
    canDetach: typeof BroadcastChannel !== "undefined",
    setFrame,
    openWindow,
    closeWindow,
  };
}
