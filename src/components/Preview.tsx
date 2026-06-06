import type { Ref } from "react";
import { Markdown } from "../render/Markdown";
import type { PostDetail } from "../types";
import blogLayout from "../styles/gatsby/blogLayout.module.scss";
import contentStyle from "../styles/gatsby/content_style.module.scss";
import styles from "./Preview.module.scss";

interface Props {
  post: PostDetail | null;
  draftContent: string;
  strapiHost: string;
  scrollRef?: Ref<HTMLDivElement>;
}

const CATEGORY_LABELS: Record<string, string> = {};

export function Preview({ post, draftContent, strapiHost, scrollRef }: Props) {
  if (!post) {
    return (
      <div ref={scrollRef} className={styles.placeholder}>
        Wähle links einen Blogpost zum Bearbeiten.
      </div>
    );
  }

  const heroUrl = post.HeroImage?.url
    ? post.HeroImage.url.startsWith("http")
      ? post.HeroImage.url
      : `${strapiHost}${post.HeroImage.url}`
    : null;

  return (
    <div ref={scrollRef} className={styles.previewRoot}>
      <div className={`blogpost ${blogLayout.blogPost}`}>
        <div className={blogLayout.blogPostHeader}>
          {heroUrl ? (
            <img
              src={heroUrl}
              alt={post.Title}
              className={blogLayout.blogPostImage}
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div className={blogLayout.blogPostImage} style={{ background: "#0C3C60" }} />
          )}
          <h1 data-isblog="true">{post.Title}</h1>
        </div>
        <div className={`${blogLayout.blogPostContent} ${contentStyle.content}`}>
          <p className={blogLayout.postAttributeLine}>
            <span className={blogLayout.blogMetaDate}>
              Veröffentlicht am{" "}
              {new Date(post.createdAt).toLocaleDateString("de-DE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {post.Author && (
                <span className={blogLayout.blogMetaUser}>
                  &nbsp;von {post.Author.Firstname} {post.Author.Lastname}
                </span>
              )}
            </span>
            {post.ba_blog_categories && post.ba_blog_categories.length > 0 && (
              <div className={blogLayout.blogMetaCategories}>
                {post.ba_blog_categories
                  .filter((c) => c !== null)
                  .map((c) => (
                    <span key={c.Slug} className={`${blogLayout.catTag} raw-link`}>
                      {CATEGORY_LABELS[c.Slug] ?? c.Slug}
                    </span>
                  ))}
              </div>
            )}
          </p>
          <Markdown>{draftContent}</Markdown>
          {post.Links && post.Links.length > 0 && (
            <div className={`hideOnPrint ${blogLayout.blogPostLinksBox}`}>
              <div className={blogLayout.blogPostLinks}>
                <hr />
                <h2>Nützliche Links</h2>
                <ul>
                  {post.Links.map((l) => (
                    <li key={l.Url}>
                      <span>
                        <a href={l.Url} target="_blank" rel="noopener noreferrer">
                          {l.Title}
                        </a>
                        {l.Subtext && <p>{l.Subtext}</p>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
