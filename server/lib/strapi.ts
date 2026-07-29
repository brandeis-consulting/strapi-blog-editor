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
  Links?: Array<{ Title: string; Url: string; Subtext: string | null }>;
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

  /** Save changes as a draft. The live Gatsby site is NOT affected. */
  async saveDraft(documentId: string, content: string): Promise<PostDetail> {
    const updated = await this.request<SingleEnvelope>(
      "PUT",
      `/content-manager/collection-types/${POST_UID}/${documentId}`,
      { Content: content },
    );
    return updated.data;
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
