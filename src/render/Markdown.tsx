import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { customLanguages } from "./highlight-langs";
import rehypeCustomElements from "./rehypeCustomElements";
import { AiLabel } from "./AiLabel";

/**
 * Identical pipeline as src/components/markdown.js in the Gatsby project.
 * Keep in sync so preview matches production rendering exactly.
 */
export function Markdown({ children, locale = "de" }: { children: string; locale?: string }) {
  /**
   * `<ai-label text images />` im Markdown.
   *
   * Attribute ohne Wert kommen als **leerer String** an, und `""` ist falsy —
   * deshalb auf Anwesenheit prüfen statt auf Wahrheit.
   */
  const aiLabel = (props: Record<string, unknown>) => (
    <AiLabel
      text={props.text !== undefined}
      images={props.images !== undefined}
      videos={props.videos !== undefined}
      audios={props.audios !== undefined}
      dark={props.dark !== undefined}
      locale={locale}
    />
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        [rehypeHighlight, { languages: customLanguages }],
        rehypeRaw,
        // Muss nach rehypeRaw laufen: repariert selbstschließend geschriebene
        // Custom-Elements, die der HTML-Parser sonst offen lässt.
        rehypeCustomElements,
      ]}
      components={{ "ai-label": aiLabel } as never}
    >
      {children}
    </ReactMarkdown>
  );
}
