import { useEffect, useRef, useState } from "react";
import { buildPreviewPost } from "../lib/previewPayload";
import type { AuthorOption, CategoryOption, PostDetail, PostFields } from "../types";
import styles from "./Preview.module.scss";

interface Props {
  post: PostDetail | null;
  fields: PostFields | null;
  categories: CategoryOption[];
  authors: AuthorOption[];
  heroUrl: string | null;
  draftContent: string;
  /** URL der Vorschauseite im Gatsby-Projekt (/blog-preview). */
  previewUrl: string | null;
  /** Meldet die iframe-Referenz nach oben, für den Scroll-Sync. */
  onFrameRef?: (frame: HTMLIFrameElement | null) => void;
}

/**
 * Die Vorschau ist ein iframe auf `/blog-preview` im Gatsby-Projekt.
 *
 * Der Editor rendert den Beitrag also nicht mehr selbst nach, sondern lässt ihn
 * von genau den Komponenten rendern, die auch die Live-Seite benutzt. Damit
 * kann die Vorschau nicht mehr veralten — weder bei CSS-Änderungen noch bei
 * neuen Templates. Der Preis: die Vorschau braucht eine erreichbare Gatsby-Seite.
 *
 * Der Entwurf geht bei jedem Tastendruck per postMessage hinüber; gespeichert
 * werden muss dafür nichts.
 */
export function Preview({
  post, fields, categories, authors, heroUrl, draftContent, previewUrl, onFrameRef,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  const origin = previewUrl ? new URL(previewUrl, window.location.href).origin : null;

  // Auf das Lebenszeichen der Vorschauseite warten. Vorher gesendete Nachrichten
  // würden ins Leere laufen, weil ihr Listener noch nicht steht.
  useEffect(() => {
    if (!origin) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const msg = event.data as { type?: string } | null;
      if (msg?.type === "preview-ready") setReady(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  // Hinweis einblenden, wenn sich die Seite nicht meldet — typischerweise ist
  // dann die Gatsby-Site nicht erreichbar oder frame-ancestors verbietet uns.
  useEffect(() => {
    if (ready || !previewUrl) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [ready, previewUrl]);

  // Entwurf hinüberschicken, sobald sich etwas ändert.
  useEffect(() => {
    if (!ready || !origin || !post || !fields) return;
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "preview-update",
        post: buildPreviewPost(post, fields, { categories, authors, heroUrl }),
        content: draftContent,
      },
      origin,
    );
  }, [ready, origin, post, fields, categories, authors, heroUrl, draftContent]);

  if (!previewUrl) {
    return (
      <div className={styles.placeholder}>
        Keine Vorschau-URL konfiguriert (<code>PREVIEW_URL</code>).
      </div>
    );
  }

  return (
    <div className={styles.frameWrap}>
      {!post && (
        <div className={styles.placeholderOverlay}>
          Wähle links einen Blogpost zum Bearbeiten.
        </div>
      )}
      {post && !ready && (
        <div className={styles.placeholderOverlay}>
          {slow ? (
            <>
              Die Vorschauseite meldet sich nicht.
              <br />
              <small>
                Erreichbar? <code>{previewUrl}</code>
                <br />
                Die Gatsby-Site muss den Editor in <code>frame-ancestors</code> erlauben.
              </small>
            </>
          ) : (
            "Vorschau wird geladen…"
          )}
        </div>
      )}
      <iframe
        ref={(el) => {
          frameRef.current = el;
          onFrameRef?.(el);
        }}
        src={previewUrl}
        title="Blog-Vorschau"
        className={styles.frame}
        // Skripte muss die Seite ausführen dürfen (React), Formulare und
        // Popups braucht sie nicht.
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
