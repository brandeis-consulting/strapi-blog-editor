/**
 * Strapi Content-Manager REST client. Uses the same JWT as Strapi's admin
 * panel — so admin users authenticated via /admin/login can edit blog posts
 * without needing a separate end-user account or API token.
 *
 * Endpoints (Strapi v5):
 *  - GET    /content-manager/collection-types/<uid>
 *  - GET    /content-manager/collection-types/<uid>/<documentId>
 *  - POST   /content-manager/collection-types/<uid>
 *  - PUT    /content-manager/collection-types/<uid>/<documentId>
 *  - POST   /content-manager/collection-types/<uid>/<documentId>/actions/publish
 */

const POST_UID = "api::ba-blog-post.ba-blog-post";
const CATEGORY_UID = "api::ba-blog-category.ba-blog-category";
const AUTHOR_UID = "api::user-profile.user-profile";

export interface PostSummary {
  documentId: string;
  Title: string;
  Slug: string;
  createdAt: string;
  updatedAt: string;
  Language: string | null;
}

export interface PostDetail extends PostSummary {
  Content: string;
  Excerpt: string | null;
  // Pflicht-Boolean beim Veröffentlichen. Strapi erzwingt es nur beim Publish,
  // nicht beim Draft-Speichern — muss also vor dem Publish gesetzt sein.
  OverridePublishDate?: boolean | null;
  PublishDate?: string | null;
  IsCareer?: boolean | null;
  TemplateType?: string | null;
  HeroImage?: { id?: number; url: string } | null;
  Author?: { documentId?: string; Firstname: string; Lastname: string } | null;
  ba_blog_categories?: Array<{ documentId?: string; Slug: string }>;
  Links?: Array<{ id?: number; Title: string; Url: string; Subtext: string | null }>;
  translation_related_posts?: Array<{ documentId?: string; Slug: string; Language?: string | null }>;
}

export interface NewPostInput {
  Title: string;
  Slug: string;
  Content: string;
  Language?: string;
}

/** Felder, die eine Übersetzung vom Original erbt. */
export interface TranslationInput extends NewPostInput {
  Excerpt: string | null;
  OverridePublishDate: boolean;
  PublishDate: string | null;
  IsCareer: boolean;
  TemplateType: string;
  /** documentIds der Kategorien des Originals. */
  categoryIds: string[];
  /** documentId des Autors, falls gesetzt. */
  authorId: string | null;
  /** numerische Datei-ID des HeroImage, falls gesetzt. */
  heroImageId: number | null;
  /** documentId des deutschen Originals — für translation_related_posts. */
  sourceId: string;
}

/**
 * Die Felder, die der Editor schreiben darf. Bewusst eine Whitelist statt eines
 * durchgereichten Bodys: alles, was hier nicht steht (createdAt, publishedAt,
 * translation_related_posts, …) gehört Strapi bzw. eigenen Workflows.
 *
 * Relationen stehen hier als IDs, nicht als Objekte — das ist die Form, die
 * das Content-Manager-API beim Schreiben erwartet (siehe createTranslation).
 */
export interface PostFields {
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Language: string;
  TemplateType: string;
  IsCareer: boolean;
  OverridePublishDate: boolean;
  PublishDate: string | null;
  /** Numerische Datei-ID des HeroImage, null = kein Bild. */
  heroImageId: number | null;
  /** documentId des Autors, null = keiner. */
  authorId: string | null;
  /** documentIds der Kategorien. */
  categoryIds: string[];
  /** `id` erhält bestehende Component-Zeilen; fehlt bei neuen Einträgen. */
  Links: Array<{ id?: number; Title: string; Url: string; Subtext: string | null }>;
}

export const LANGUAGES = ["Deutsch", "Englisch"] as const;
export const TEMPLATE_TYPES = ["Standard", "Cheatsheet", "Newsletter"] as const;

export interface CategoryOption {
  documentId: string;
  Slug: string;
  Name: string;
  /**
   * Name je Locale. Die Vorschau beschriftet Kategorien in der Sprache des
   * Beitrags — genau wie categoryLanguageMapping in gatsby-node.js.
   */
  names: Record<string, string>;
}

export interface AuthorOption {
  documentId: string;
  Firstname: string;
  Lastname: string;
  /**
   * Steuern auf der Live-Site, ob der Autorenname zum Trainer- bzw.
   * Autorenprofil verlinkt. Die Vorschau braucht sie, um dieselbe Meta-Zeile
   * zu rendern wie die echte Seite.
   */
  ShowTrainerCard?: boolean;
  ShowAuthorCard?: boolean;
}

export interface MediaImage {
  id: number;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
  /** Vorschaugröße aus Strapi, falls vorhanden — spart Traffic im Picker. */
  thumbnailUrl?: string;
}

export interface UploadedFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
}

interface ListEnvelope {
  results: PostDetail[];
  pagination: { page: number; pageSize: number; pageCount: number; total: number };
}

interface SingleEnvelope {
  data: PostDetail;
  meta?: unknown;
}

export class StrapiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {
    if (!baseUrl) throw new Error("STRAPI_URL is missing");
    if (!token) throw new Error("STRAPI_TOKEN is missing");
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      throw new Error("AUTH_EXPIRED:Sitzung abgelaufen — bitte neu anmelden.");
    }
    if (res.status === 403) {
      throw new Error(
        "Keine Berechtigung für diese Aktion. Bitte Strapi-Rolle prüfen.",
      );
    }
    if (!res.ok) {
      throw new Error(`Strapi ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async listPosts(): Promise<PostSummary[]> {
    const query = new URLSearchParams({
      page: "1",
      pageSize: "500",
      sort: "createdAt:DESC",
    });
    const data = await this.request<ListEnvelope>(
      "GET",
      `/content-manager/collection-types/${POST_UID}?${query}`,
    );
    return data.results.map((p) => ({
      documentId: p.documentId,
      Title: p.Title,
      Slug: p.Slug,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      Language: p.Language,
    }));
  }

  /**
   * Alle vergebenen Slugs — für die Kollisionsprüfung beim Anlegen einer
   * Übersetzung. Bewusst inklusive Entwürfe: ein bereits als Entwurf
   * angelegter Slug ist ebenso belegt.
   */
  async listSlugs(): Promise<string[]> {
    const query = new URLSearchParams({ page: "1", pageSize: "500", fields: "Slug" });
    const data = await this.request<ListEnvelope>(
      "GET",
      `/content-manager/collection-types/${POST_UID}?${query}`,
    );
    return data.results.map((p) => p.Slug).filter(Boolean);
  }

  /**
   * Legt die englische Fassung als **Entwurf** an und verknüpft sie beidseitig
   * mit dem Original.
   *
   * `translation_related_posts` ist eine oneToMany-Self-Relation und wird von
   * Strapi *nicht* automatisch gegenseitig gesetzt. Ohne die Rückrichtung
   * funktioniert der Sprachumschalter nur einseitig und Google ignoriert den
   * hreflang, weil er nicht reziprok ist.
   */
  async createTranslation(input: TranslationInput): Promise<PostDetail> {
    const created = await this.request<SingleEnvelope>(
      "POST",
      `/content-manager/collection-types/${POST_UID}`,
      {
        Title: input.Title,
        Slug: input.Slug,
        Content: input.Content,
        Excerpt: input.Excerpt,
        Language: input.Language ?? "Englisch",
        OverridePublishDate: input.OverridePublishDate,
        PublishDate: input.PublishDate,
        IsCareer: input.IsCareer,
        TemplateType: input.TemplateType,
        ba_blog_categories: input.categoryIds,
        Author: input.authorId,
        HeroImage: input.heroImageId,
        translation_related_posts: [input.sourceId],
      },
    );

    // Rückrichtung am Original ergänzen, ohne bestehende Verknüpfungen zu verlieren.
    const source = await this.getPost(input.sourceId);
    const existing = (source?.translation_related_posts ?? [])
      .map((t) => t.documentId)
      .filter((id): id is string => Boolean(id));
    await this.request<SingleEnvelope>(
      "PUT",
      `/content-manager/collection-types/${POST_UID}/${input.sourceId}`,
      { translation_related_posts: [...new Set([...existing, created.data.documentId])] },
    );

    return created.data;
  }

  async getPost(documentId: string): Promise<PostDetail | null> {
    const query = new URLSearchParams({
      "populate[HeroImage]": "true",
      "populate[Author]": "true",
      "populate[ba_blog_categories]": "true",
      "populate[Links]": "true",
      "populate[translation_related_posts]": "true",
    });
    const data = await this.request<SingleEnvelope>(
      "GET",
      `/content-manager/collection-types/${POST_UID}/${documentId}?${query}`,
    );
    return data.data ?? null;
  }

  /**
   * Save changes as a draft. The live Gatsby site is NOT affected.
   *
   * `content` und `fields` sind einzeln optional: der Editor schickt nur, was
   * sich geändert hat. Beides zusammen ergibt trotzdem genau **einen** PUT —
   * zwei Requests würden bei einem Fehler dazwischen einen halb gespeicherten
   * Beitrag hinterlassen.
   */
  async saveDraft(
    documentId: string,
    patch: { content?: string; fields?: PostFields },
  ): Promise<PostDetail> {
    const body: Record<string, unknown> = {};
    if (patch.content !== undefined) body.Content = patch.content;

    if (patch.fields) {
      const f = patch.fields;
      body.Title = f.Title;
      body.Slug = f.Slug;
      body.Excerpt = f.Excerpt;
      body.Language = f.Language;
      body.TemplateType = f.TemplateType;
      body.IsCareer = f.IsCareer;
      body.OverridePublishDate = f.OverridePublishDate;
      // Strapi blendet PublishDate aus, wenn OverridePublishDate false ist
      // (conditions.visible im Schema). Der Wert bleibt dabei erhalten — wir
      // machen es genauso, damit ein versehentliches Aus- und Wiedereinschalten
      // das Datum nicht verliert.
      body.PublishDate = f.PublishDate;
      body.HeroImage = f.heroImageId;
      body.Author = f.authorId;
      body.ba_blog_categories = f.categoryIds;
      body.Links = f.Links;
    }

    if (Object.keys(body).length === 0) {
      const current = await this.getPost(documentId);
      if (!current) throw new Error(`Beitrag ${documentId} nicht gefunden.`);
      return current;
    }

    const updated = await this.request<SingleEnvelope>(
      "PUT",
      `/content-manager/collection-types/${POST_UID}/${documentId}`,
      body,
    );
    return updated.data;
  }

  /**
   * Kategorien mitsamt ihren Übersetzungen.
   *
   * Wird **je Locale einzeln** abgefragt und über die documentId zusammengeführt.
   * Der naheliegende Weg — `populate[localizations]` wie in der Gatsby-Query —
   * funktioniert auf dem Content-Manager-Listenendpunkt nicht: er liefert
   * kommentarlos nur die Standardsprache, und die englischen Beiträge hätten
   * deutsche Kategorie-Labels. In Strapi v5 teilen sich alle Sprachfassungen
   * eines Dokuments dieselbe documentId, deshalb trägt das Zusammenführen.
   *
   * Die Locale-Liste kommt aus der Language-Enumeration des Blogposts: mehr
   * Sprachen als die kann ein Beitrag ohnehin nicht haben.
   */
  async listCategories(): Promise<CategoryOption[]> {
    const fetchLocale = async (locale: string) => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "200",
        sort: "Name:ASC",
        locale,
      });
      const data = await this.request<{
        results: Array<{ documentId: string; Slug: string; Name: string; locale?: string | null }>;
      }>("GET", `/content-manager/collection-types/${CATEGORY_UID}?${query}`);
      return data.results;
    };

    // Die Standardsprache bestimmt Reihenfolge und Fallback-Namen; schlägt eine
    // Übersetzung fehl, bleibt die Auswahl trotzdem benutzbar.
    const [de, en] = await Promise.all([
      fetchLocale("de"),
      fetchLocale("en").catch(() => []),
    ]);

    const byId = new Map<string, CategoryOption>();
    for (const c of de) {
      byId.set(c.documentId, {
        documentId: c.documentId,
        Slug: c.Slug,
        Name: c.Name,
        names: { de: c.Name },
      });
    }
    for (const c of en) {
      const existing = byId.get(c.documentId);
      if (existing) existing.names.en = c.Name;
      else {
        byId.set(c.documentId, {
          documentId: c.documentId,
          Slug: c.Slug,
          Name: c.Name,
          names: { en: c.Name },
        });
      }
    }
    return [...byId.values()];
  }

  /** Autoren für die Auswahl. Sortiert nach Nachname, wie im Admin-Panel. */
  async listAuthors(): Promise<AuthorOption[]> {
    const query = new URLSearchParams({
      page: "1",
      pageSize: "200",
      sort: "Lastname:ASC",
    });
    const data = await this.request<{
      results: Array<{
        documentId: string;
        Firstname: string;
        Lastname: string;
        ShowTrainerCard?: boolean;
        ShowAuthorCard?: boolean;
      }>;
    }>("GET", `/content-manager/collection-types/${AUTHOR_UID}?${query}`);

    return data.results.map((a) => ({
      documentId: a.documentId,
      Firstname: a.Firstname,
      Lastname: a.Lastname,
      ShowTrainerCard: a.ShowTrainerCard ?? false,
      ShowAuthorCard: a.ShowAuthorCard ?? false,
    }));
  }

  /**
   * Bilder aus der Medienbibliothek für den HeroImage-Picker.
   *
   * `/upload/files` antwortet je nach Strapi-Version mit einem nackten Array
   * oder mit `{ results, pagination }` — beides wird hier abgefangen, damit ein
   * Minor-Update den Picker nicht stillschweigend leert.
   */
  async listMediaImages(search?: string): Promise<MediaImage[]> {
    // Flache page/pageSize-Parameter: das Upload-Plugin wertet die
    // pagination[...]-Schreibweise nicht aus und liefert dann stumm nur die
    // ersten 10 Dateien.
    const query = new URLSearchParams({
      "filters[mime][$contains]": "image",
      sort: "createdAt:DESC",
      page: "1",
      pageSize: "60",
    });
    if (search) query.set("_q", search);

    const raw = await this.request<
      { results?: unknown[] } | unknown[]
    >("GET", `/upload/files?${query}`);

    const list = (Array.isArray(raw) ? raw : (raw.results ?? [])) as Array<{
      id: number;
      name: string;
      url: string;
      mime: string;
      width?: number;
      height?: number;
      formats?: { thumbnail?: { url?: string }; small?: { url?: string } };
    }>;

    const absolute = (u?: string): string | undefined =>
      !u ? undefined : u.startsWith("http") ? u : `${this.baseUrl}${u}`;

    return list.map((f) => ({
      id: f.id,
      name: f.name,
      url: absolute(f.url)!,
      mime: f.mime,
      width: f.width,
      height: f.height,
      thumbnailUrl: absolute(f.formats?.thumbnail?.url ?? f.formats?.small?.url),
    }));
  }

  /**
   * Publish the current draft. Use after saveDraft when going live.
   *
   * Strapi requires the OverridePublishDate boolean to be non-null before a
   * post can be published (validated on the publish action, not on draft save).
   * The publish action itself takes no body, so we write the flag into the
   * draft first when one is supplied.
   */
  async publish(documentId: string, overridePublishDate?: boolean): Promise<PostDetail> {
    if (overridePublishDate !== undefined) {
      await this.request<SingleEnvelope>(
        "PUT",
        `/content-manager/collection-types/${POST_UID}/${documentId}`,
        { OverridePublishDate: overridePublishDate },
      );
    }
    const result = await this.request<SingleEnvelope>(
      "POST",
      `/content-manager/collection-types/${POST_UID}/${documentId}/actions/publish`,
    );
    return result.data;
  }

  /** Create a new blog post as a draft. */
  async createPost(input: NewPostInput): Promise<PostDetail> {
    const result = await this.request<SingleEnvelope>(
      "POST",
      `/content-manager/collection-types/${POST_UID}`,
      input,
    );
    return result.data;
  }

  /**
   * Upload a single image to Strapi's media library.
   * Uses /upload (works with Admin-JWT) and returns an absolute URL.
   * Pass folderId to place the file in a specific media library folder.
   */
  async uploadImage(
    data: Uint8Array,
    filename: string,
    mimetype: string,
    folderId?: number,
  ): Promise<UploadedFile> {
    const form = new FormData();
    const blob = new Blob([data as BlobPart], { type: mimetype });
    form.append("files", blob, filename);
    if (folderId !== undefined) {
      form.append("fileInfo", JSON.stringify({ folder: folderId }));
    }

    const res = await fetch(`${this.baseUrl}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (res.status === 401) {
      throw new Error("AUTH_EXPIRED:Sitzung abgelaufen — bitte neu anmelden.");
    }
    if (!res.ok) {
      throw new Error(`Upload fehlgeschlagen: ${res.status} ${await res.text()}`);
    }
    const files = (await res.json()) as UploadedFile[];
    if (!files.length) throw new Error("Upload-Antwort war leer.");
    const f = files[0];
    return {
      ...f,
      url: f.url.startsWith("http") ? f.url : `${this.baseUrl}${f.url}`,
    };
  }
}
