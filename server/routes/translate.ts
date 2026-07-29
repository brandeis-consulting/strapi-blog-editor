/**
 * Übersetzt einen Beitrag ins Englische und legt die Fassung als Entwurf an.
 *
 * Bewusst serverseitig: die CSP des Editors erlaubt `connect-src 'self'`, der
 * Browser könnte api.anthropic.com also gar nicht erreichen. Der API-Key kommt
 * pro Anfrage aus dem Modal, wird nur für diesen einen Aufruf verwendet und
 * weder gespeichert noch geloggt.
 *
 * Fachlich identisch zur Massenübersetzung in
 * brandeis-academy/scripts/translate-posts.mjs — siehe ../lib/translate.ts.
 */
import { Router, type Response } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { StrapiClient, type PostDetail } from "../lib/strapi";
import { translatePost } from "../lib/translate";

const STRAPI_URL = process.env.STRAPI_URL ?? "https://cms.brandeis.de";

export const translateRouter = Router();
translateRouter.use(requireAuth);

const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[äöüß]/g, (m) => UMLAUTS[m] ?? m)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
}

/**
 * Dieselbe Regex wie createRedirect in brandeis-academy/gatsby-node.js. Sie ist
 * nicht verankert, trifft also auch mitten im Slug — ein vorangestelltes "en-"
 * schützt nicht. Statt den Slug zu verstümmeln prüfen wir, ob der daraus
 * erzeugte Legacy-Redirect-Pfad schon belegt ist.
 */
const LEGACY_REDIRECT = /(info|events|elearning|20\d\d)-(.+)/;

const redirectPathFor = (slug: string): string | null => {
  const m = LEGACY_REDIRECT.exec(slug);
  return m ? `${m[1]}/${m[2]}` : null;
};

function uniqueSlug(candidate: string, taken: Set<string>): string {
  const takenRedirects = new Set(
    [...taken].map(redirectPathFor).filter((p): p is string => Boolean(p)),
  );
  const conflicts = (s: string): boolean => {
    if (taken.has(s)) return true;
    const r = redirectPathFor(s);
    return r ? takenRedirects.has(r) : false;
  };

  const base = slugify(candidate) || "post";
  if (!conflicts(base)) return base;
  if (!conflicts(`${base}-en`)) return `${base}-en`;
  for (let i = 2; ; i += 1) if (!conflicts(`${base}-en-${i}`)) return `${base}-en-${i}`;
}

/**
 * Das Datum, das das Original tatsächlich anzeigt: normalerweise createdAt,
 * bei gesetztem PublishDate aber dieses. Sonst bekäme die Übersetzung ein
 * anderes Datum als das Original.
 */
function effectiveDate(post: PostDetail): string {
  const iso = post.OverridePublishDate && post.PublishDate ? post.PublishDate : post.createdAt;
  return (iso ?? "").slice(0, 10);
}

translateRouter.post("/", async (req: AuthedRequest, res: Response) => {
  const { documentId, apiKey } = req.body as { documentId?: string; apiKey?: string };

  if (!documentId) return res.status(400).json({ error: "documentId fehlt." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "API-Key fehlt." });

  const client = new StrapiClient(STRAPI_URL, req.jwt!);

  try {
    const source = await client.getPost(documentId);
    if (!source) return res.status(404).json({ error: "Beitrag nicht gefunden." });

    if (source.Language === "Englisch") {
      return res.status(400).json({ error: "Der Beitrag ist bereits auf Englisch." });
    }

    const existing = (source.translation_related_posts ?? [])
      .find((t) => t.Language === "Englisch");
    if (existing) {
      return res.status(409).json({
        error: `Es gibt bereits eine englische Fassung: „${existing.Slug}“. Erst dort prüfen, statt eine zweite anzulegen.`,
      });
    }

    const translation = await translatePost(apiKey.trim(), {
      Title: source.Title,
      Excerpt: source.Excerpt,
      Content: source.Content,
    });

    const taken = new Set(await client.listSlugs());
    const slug = uniqueSlug(translation.SlugSuggestion || translation.Title, taken);

    const created = await client.createTranslation({
      Title: translation.Title,
      Slug: slug,
      Content: translation.Content,
      Excerpt: translation.Excerpt || null,
      Language: "Englisch",
      // Anzeigedatum des Originals übernehmen, sonst steht die Übersetzung auf heute.
      OverridePublishDate: true,
      PublishDate: effectiveDate(source) || null,
      IsCareer: source.IsCareer ?? false,
      TemplateType: source.TemplateType ?? "Standard",
      categoryIds: (source.ba_blog_categories ?? [])
        .map((c) => c.documentId)
        .filter((id): id is string => Boolean(id)),
      authorId: source.Author?.documentId ?? null,
      heroImageId: source.HeroImage?.id ?? null,
      sourceId: documentId,
    });

    // Gegenprüfen statt annehmen: Relationen und Datum verhalten sich in der
    // Content-Manager-API anders als in der öffentlichen REST-API. Was nicht
    // ankam, wird gemeldet, statt still zu fehlen.
    const [check, back] = await Promise.all([
      client.getPost(created.documentId),
      client.getPost(documentId),
    ]);
    const warnings: string[] = [];
    if (!(back?.translation_related_posts ?? []).some((t) => t.Slug === slug)) {
      warnings.push("Die Verknüpfung vom deutschen Beitrag zur Übersetzung fehlt.");
    }
    if (!(check?.translation_related_posts ?? []).some((t) => t.documentId === documentId)) {
      warnings.push("Die Verknüpfung von der Übersetzung zum Original fehlt.");
    }
    if (check?.OverridePublishDate !== true || !check?.PublishDate) {
      warnings.push("Das Anzeigedatum wurde nicht übernommen.");
    }
    if ((source.ba_blog_categories ?? []).length && !(check?.ba_blog_categories ?? []).length) {
      warnings.push("Die Kategorien wurden nicht übernommen.");
    }

    res.json({ post: created, slug, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("AUTH_EXPIRED:")) {
      res.clearCookie("blog_editor_session", { path: "/" });
      return res.status(401).json({ error: msg });
    }
    // Häufigster Fall: falscher oder abgelaufener Anthropic-Key.
    if (/401|authentication|invalid.*api.?key/i.test(msg)) {
      return res.status(400).json({ error: "Der API-Key wurde von Anthropic abgelehnt." });
    }
    res.status(500).json({ error: msg });
  }
});
