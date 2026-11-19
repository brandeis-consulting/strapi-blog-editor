import { useEffect, useMemo, useRef, useState } from "react";
import { strapi } from "../api/strapi";
import {
  PREVIEW_WINDOW_LOCK,
  PREVIEW_WINDOW_NAME,
  openPreviewChannel,
  type FromPreviewMessage,
  type ToPreviewMessage,
} from "../lib/previewChannel";
import type { PreviewUpdateMessage } from "../lib/previewPayload";
import { currentWindowBounds, saveWindowBounds } from "../lib/previewWindowBounds";
import { Preview } from "./Preview";

const TITLE = "Vorschau — Brandeis Blog Editor";

/**
 * Die Vorschau als eigenes Browserfenster (`/preview-window`), für die Arbeit
 * mit zwei Monitoren.
 *
 * Das Fenster kennt keinen Beitrag und keine Sitzung — es ist eine reine
 * Relaisstation: Was der Editor über den BroadcastChannel schickt, geht per
 * postMessage an den iframe, und was die Vorschauseite meldet, geht zurück.
 * Für die Gatsby-Seite sieht das genauso aus wie die angedockte Vorschau.
 */
export function PreviewWindow() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hasPost, setHasPost] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    document.title = TITLE;
    strapi
      .getConfig()
      .then((c) => setPreviewUrl(c.previewUrl))
      .catch(() => setPreviewUrl(null));
  }, []);

  // Lage des Fensters merken, damit es beim nächsten Mal wieder dort aufgeht.
  // Für das Verschieben eines Fensters gibt es kein Ereignis, deshalb wird
  // nachgesehen statt zugehört.
  useEffect(() => {
    // Nur das vom Editor geöffnete Fenster zählt. Wer die Adresse von Hand in
    // einem Tab öffnet, soll nicht die Lage seines Browserfensters hinterlegen.
    if (window.name !== PREVIEW_WINDOW_NAME) return;
    let last = "";
    const timer = setInterval(() => {
      // Ein minimiertes Fenster meldet Fantasiekoordinaten.
      if (document.visibilityState !== "visible") return;
      const bounds = currentWindowBounds();
      const key = JSON.stringify(bounds);
      if (key === last) return;
      last = key;
      saveWindowBounds(bounds);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const origin = useMemo(() => {
    if (!previewUrl) return null;
    try {
      return new URL(previewUrl, window.location.href).origin;
    } catch {
      return null;
    }
  }, [previewUrl]);

  useEffect(() => {
    if (!origin) return;

    let frameReady = false;
    // Der letzte Entwurf bleibt hier liegen: kommt er vor dem Lebenszeichen der
    // Vorschauseite an (oder lädt der iframe neu), wird er nachgereicht.
    let lastUpdate: PreviewUpdateMessage | null = null;

    const toFrame = (msg: ToPreviewMessage) =>
      frameRef.current?.contentWindow?.postMessage(msg, origin);

    const channel = openPreviewChannel((msg) => {
      switch (msg.type) {
        case "editor-hello":
          channel?.post({ type: "window-open" });
          break;
        case "window-close":
          window.close();
          break;
        case "to-preview":
          if (msg.msg.type === "preview-update") {
            lastUpdate = msg.msg;
            setHasPost(true);
            document.title = `${msg.msg.post.Title || "(ohne Titel)"} — Vorschau`;
          }
          if (frameReady) toFrame(msg.msg);
          break;
      }
    });
    if (!channel) return;

    function onFrameMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data as FromPreviewMessage | null;
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "preview-ready") {
        frameReady = true;
        setReady(true);
        if (lastUpdate) toFrame(lastUpdate);
      } else {
        channel?.post({ type: "from-preview", msg });
      }
    }
    window.addEventListener("message", onFrameMessage);

    // Beim Editor anmelden. Der Lock läuft mit dem Fenster aus und sagt dem
    // Editor auch dann Bescheid, wenn die Abschiedsnachricht nicht mehr
    // rausgeht. `shared`, damit ein zweites Vorschaufenster nicht hängen bleibt.
    let disposed = false;
    let releaseLock: () => void = () => undefined;
    const announce = () => channel.post({ type: "window-open" });
    if (navigator.locks) {
      void navigator.locks.request(PREVIEW_WINDOW_LOCK, { mode: "shared" }, () => {
        // Der Lock kann erst kommen, nachdem der Effekt schon abgeräumt ist.
        if (disposed) return;
        announce();
        return new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
      });
    } else {
      announce();
    }

    const onPageHide = () => channel.post({ type: "window-closed" });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("message", onFrameMessage);
      window.removeEventListener("pagehide", onPageHide);
      disposed = true;
      releaseLock();
      channel.close();
    };
  }, [origin]);

  return (
    <Preview
      previewUrl={previewUrl}
      hasPost={hasPost}
      ready={ready}
      emptyHint="Wähle im Editor einen Blogpost zum Bearbeiten."
      onFrameRef={(el) => {
        frameRef.current = el;
      }}
    />
  );
}
