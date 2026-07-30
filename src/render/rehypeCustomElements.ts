import type { Root, RootContent, Element } from "hast";

/**
 * Repariert selbstschließend geschriebene Custom-Elements im hast-Baum.
 *
 * Kopie von brandeis-academy/src/scripts/rehypeCustomElements.js (ADR-004:
 * Renderer-Bausteine werden kopiert, nicht nachgebaut). Ursprung ist
 * learning-portal/src/scripts/rehypeCustomElements.js, dort für <poll /> & Co.
 *
 * Warum überhaupt: HTML kennt selbstschließende Tags nur für bekannte
 * void-Elemente. Bei einem unbekannten Tag ignoriert der Parser den Slash, das
 * Tag bleibt offen und **alles Folgende wird zu seinem Kind**. Ein
 * `<ai-label text />` am Anfang eines Beitrags saugt so den ganzen Artikel in
 * die Label-Box — in der Vorschau genauso wie auf der Live-Site.
 *
 * Bewusst auf dem Baum statt per Textersetzung: sonst würde die Reparatur auch
 * in Codeblöcken zuschlagen und ein Beitrag, der die Syntax dokumentiert, sein
 * eigenes Beispiel zerstören.
 */

const VOID_ELEMENTS = new Set(["ai-label"]);

type Parent = Root | Element;

const isElement = (n: RootContent): n is Element => n.type === "element";
const isVoidElement = (n: RootContent): n is Element =>
  isElement(n) && VOID_ELEMENTS.has(n.tagName);
const isBlank = (n: RootContent): boolean => n.type === "text" && !n.value.trim();

/** Holt fälschlich verschluckte Kinder wieder heraus, als Geschwister dahinter. */
function hoistVoidChildren(node: Parent): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (isElement(child)) hoistVoidChildren(child);
  }

  node.children = node.children.flatMap((child): RootContent[] => {
    if (!isVoidElement(child) || !(child.children ?? []).length) return [child];
    const lifted = child.children as RootContent[];
    child.children = [];
    return [child, ...lifted];
  });
}

/**
 * Wickelt Absätze aus, die nur ein Void-Element enthalten — ein <div> in einem
 * <p> ist ungültiges HTML und der Browser schließt den Absatz vorzeitig.
 */
function unwrapVoidParagraphs(node: Parent): void {
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (isElement(child)) unwrapVoidParagraphs(child);
  }

  node.children = node.children.flatMap((child): RootContent[] => {
    if (!isElement(child) || child.tagName !== "p") return [child];
    const meaningful = (child.children ?? []).filter((c) => !isBlank(c as RootContent));
    if (meaningful.length === 1 && isVoidElement(meaningful[0] as RootContent)) {
      return [meaningful[0] as RootContent];
    }
    return [child];
  });
}

export default function rehypeCustomElements() {
  return (tree: Root): void => {
    hoistVoidChildren(tree);
    unwrapVoidParagraphs(tree);
  };
}
