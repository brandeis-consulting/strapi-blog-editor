import { useEffect, useRef, useState } from "react";
import { strapi } from "../api/strapi";
import type { MediaImage } from "../types";
import styles from "./MediaPicker.module.scss";

interface Props {
  open: boolean;
  /** Aktuell gewähltes Bild — wird in der Liste hervorgehoben. */
  currentId: number | null;
  onCancel: () => void;
  onPick: (image: MediaImage) => void;
}

/**
 * Auswahl eines Beitragsbilds aus der Strapi-Medienbibliothek, mit Upload als
 * Alternative. Lädt erst beim Öffnen — die Liste ist je nach Bibliothek groß
 * und wird beim Start des Editors nicht gebraucht.
 */
export function MediaPicker({ open, currentId, onCancel, onPick }: Props) {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    strapi
      .listMedia(search.trim() || undefined)
      .then((list) => {
        if (!cancelled) setImages(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, search]);

  // Suchfeld und Fehler zurücksetzen, damit ein erneutes Öffnen frisch startet.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await strapi.uploadImage(file);
      onPick({
        id: uploaded.id,
        name: uploaded.name,
        url: uploaded.url,
        mime: uploaded.mime,
        width: uploaded.width,
        height: uploaded.height,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Beitragsbild wählen</h2>
          <input
            type="search"
            placeholder="In der Medienbibliothek suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.search}
          />
        </header>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.grid}>
          {loading && <div className={styles.hint}>Lade Medienbibliothek…</div>}
          {!loading && images.length === 0 && !error && (
            <div className={styles.hint}>
              {search ? "Keine Treffer." : "Keine Bilder in der Medienbibliothek."}
            </div>
          )}
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              className={img.id === currentId ? styles.tileActive : styles.tile}
              onClick={() => onPick(img)}
              title={`${img.name}${img.width ? ` — ${img.width}×${img.height}` : ""}`}
            >
              <img src={img.thumbnailUrl ?? img.url} alt="" loading="lazy" />
              <span>{img.name}</span>
            </button>
          ))}
        </div>

        <footer>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={styles.upload}
          >
            {uploading ? "Lade hoch…" : "Neues Bild hochladen"}
          </button>
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
        </footer>
      </div>
    </div>
  );
}
