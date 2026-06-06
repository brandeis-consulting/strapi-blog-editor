import { useMemo, useState } from "react";
import type { PostSummary } from "../types";
import { groupPostsByYearMonth } from "../hooks/usePosts";
import styles from "./PostList.module.scss";

interface Props {
  posts: PostSummary[];
  selectedId: string | null;
  onSelect: (post: PostSummary) => void;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onNew: () => void;
  dirtyIds: Set<string>;
}

export function PostList({
  posts, selectedId, onSelect, loading, error, onReload, onNew, dirtyIds,
}: Props) {
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? posts.filter((p) => p.Title.toLowerCase().includes(needle))
      : posts;
    return groupPostsByYearMonth(filtered);
  }, [posts, filter]);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Blogposts</h2>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.reload}
            onClick={onReload}
            disabled={loading}
            title="Neu laden"
          >
            ↻
          </button>
        </div>
      </div>
      <button type="button" className={styles.newBtn} onClick={onNew}>
        + Neuer Beitrag
      </button>
      <input
        type="search"
        placeholder="Suchen..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className={styles.search}
      />
      {error && <div className={styles.error}>{error}</div>}
      {loading && !posts.length ? (
        <div className={styles.empty}>Lade…</div>
      ) : (
        <div className={styles.scroll}>
          {groups.map((group) => (
            <section key={group.year} className={styles.yearGroup}>
              <h3>{group.year}</h3>
              {group.months.map((m) => (
                <div key={m.month} className={styles.monthGroup}>
                  <h4>{m.label}</h4>
                  <ul>
                    {m.posts.map((post) => (
                      <li
                        key={post.documentId}
                        className={
                          post.documentId === selectedId ? styles.itemActive : styles.item
                        }
                        onClick={() => onSelect(post)}
                      >
                        <span
                          className={
                            dirtyIds.has(post.documentId) ? styles.dirtyDot : styles.dirtyDotHidden
                          }
                          title={dirtyIds.has(post.documentId) ? "Ungespeicherte Änderungen" : undefined}
                        >
                          ●
                        </span>
                        <span className={styles.itemDate}>
                          {new Date(post.createdAt).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                        <span className={styles.itemTitle}>{post.Title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
          {!groups.length && <div className={styles.empty}>Keine Treffer</div>}
        </div>
      )}
    </aside>
  );
}
