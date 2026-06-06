import { useCallback, useEffect, useState } from "react";
import { strapi } from "../api/strapi";
import type { PostSummary } from "../types";

export interface PostsState {
  posts: PostSummary[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function usePosts(): PostsState {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await strapi.listPosts();
      setPosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { posts, loading, error, reload };
}

export interface PostGroup {
  year: number;
  months: Array<{ month: number; label: string; posts: PostSummary[] }>;
}

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function groupPostsByYearMonth(posts: PostSummary[]): PostGroup[] {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const byYear = new Map<number, Map<number, PostSummary[]>>();
  for (const post of sorted) {
    const date = new Date(post.createdAt);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const yearMap = byYear.get(year)!;
    if (!yearMap.has(month)) yearMap.set(month, []);
    yearMap.get(month)!.push(post);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, posts]) => ({
          month,
          label: MONTH_NAMES[month],
          posts,
        })),
    }));
}
