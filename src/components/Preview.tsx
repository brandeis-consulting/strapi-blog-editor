import { useEffect, useState } from "react";
import styles from "./Preview.module.scss";

interface Props {
  /** URL der Vorschauseite im Gatsby-Projekt (/blog-preview). */
  previewUrl: string | null;
  /** Es gibt einen Beitrag, den die Vorschau zeigen kann. */
  hasPost: boolean;
  /** Die Vorschauseite hat sich gemeldet. */
  ready: boolean;
  /** Hinweis, solange kein Beitrag da ist. */
  emptyHint: string;
  /** Meldet die iframe-Referenz nach oben — dort sitzt die Verbindung. */
  onFrameRef: (frame: HTMLIFrameElement | null) => void;
}

/**
 * Die Vorschau ist ein iframe auf `/blog-preview` im Gatsby-Projekt.
 *
 * Der Editor rendert den Beitrag also nicht mehr selbst nach, sondern lässt ihn
 * von genau den Komponenten rendern, die auch die Live-Seite benutzt. Damit
 * kann die Vorschau nicht mehr veralten — weder bei CSS-Änderungen noch bei
 * neuen Templates. Der Preis: die Vorschau braucht eine erreichbare Gatsby-Seite.
 *
 * Diese Komponente ist nur der Rahmen. Wer dem iframe den Entwurf schickt,
 * hängt davon ab, wo er sitzt: im Editor (usePreviewLink) oder im eigenen
 * Vorschaufenster (PreviewWindow).
 */
export function Preview({ previewUrl, hasPost, ready, emptyHint, onFrameRef }: Props) {
  const [slow, setSlow] = useState(false);

  // Hinweis einblenden, wenn sich die Seite nicht meldet — typischerweise ist
  // dann die Gatsby-Site nicht erreichbar oder frame-ancestors verbietet uns.
  useEffect(() => {
    if (ready || !previewUrl) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [ready, previewUrl]);

  if (!previewUrl) {
    return (
      <div className={styles.placeholder}>
        Keine Vorschau-URL konfiguriert (<code>PREVIEW_URL</code>).
      </div>
    );
  }

  return (
    <div className={styles.frameWrap}>
      {!hasPost && <div className={styles.placeholderOverlay}>{emptyHint}</div>}
      {hasPost && !ready && (
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
        ref={onFrameRef}
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
