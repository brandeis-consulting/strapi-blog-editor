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
  HeroImage?: { url: string } | null;
  Author?: { Firstname: string; Lastname: string } | null;
  ba_blog_categories?: Array<{ Slug: string }>;
  Links?: Array<{ Title: string; Url: string; Subtext: string | null }>;
}

export interface NewPostInput {
  Title: string;
  Slug: string;
  Content: string;
  Language?: string;
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

  async getPost(documentId: string): Promise<PostDetail | null> {
    const query = new URLSearchParams({
      "populate[HeroImage]": "true",
      "populate[Author]": "true",
      "populate[ba_blog_categories]": "true",
      "populate[Links]": "true",
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

  /** Publish the current draft. Use after saveDraft when going live. */
  async publish(documentId: string): Promise<PostDetail> {
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
}
