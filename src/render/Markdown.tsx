import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { customLanguages } from "./highlight-langs";

/**
 * Identical pipeline as src/components/markdown.js in the Gatsby project.
 * Keep in sync so preview matches production rendering exactly.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        [rehypeHighlight, { languages: customLanguages }],
        rehypeRaw,
      ]}
    >
      {children}
    </ReactMarkdown>
  );
}
