/**
 * Übersetzt einen Blogbeitrag ins Englische — Claude API.
 *
 * ⚠ System-Prompt und Schema sind bewusst identisch zur Massenübersetzung in
 *   brandeis-academy/scripts/translate-posts.mjs. Änderungen bitte in **beiden**
 *   Dateien nachziehen, sonst driften Einzel- und Batch-Übersetzung auseinander.
 *   (Ein gemeinsames Paket wäre schöner, lohnt sich für zwei Aufrufstellen aber
 *   nicht — die Repos sind getrennt.)
 *
 * Unterschied zum Batch: dort läuft die Message Batches API (50 % günstiger,
 * aber asynchron mit Wartezeit). Hier zählt die Antwortzeit, deshalb ein
 * einzelner synchroner Aufruf.
 *
 * Der API-Key wird pro Anfrage übergeben und weder geloggt noch gespeichert.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

const SYSTEM = `Du übersetzt technische Blogbeiträge über SAP-Entwicklung (ABAP, CDS, SQLScript, RAP, HANA, BW) aus dem Deutschen ins Englische für den Blog von Brandeis Consulting.

INHALT UND TON
- Übersetze fachlich präzise, nicht wörtlich. Zielgruppe sind SAP-Entwickler und -Berater.
- Verwende die offizielle englische SAP-Terminologie. Beispiele: "Ablauflogik" -> "flow logic", "Datenelement" -> "data element", "Bewegungsdaten" -> "transaction data", "Merkmal" -> "characteristic", "Kennzahl" -> "key figure", "Verbuchung" -> "update", "Mandant" -> "client", "Berechtigungsobjekt" -> "authorization object".
- Behalte die Anrede-Ebene des Originals bei (der Blog duzt bzw. siezt konsistent innerhalb eines Beitrags).

STRUKTUR – ABSOLUT ERHALTEN
- Die Ausgabe ist Markdown mit eingebettetem rohem HTML. Übernimm die Struktur exakt: Überschriftenebenen, Listen, Tabellen, Zitate, Fußnoten, Zeilenumbrüche zwischen Blöcken.
- HTML-Tags, Attribute, CSS-Klassen und IDs bleiben unverändert. Übersetze nur den Textinhalt zwischen den Tags sowie alt- und title-Attribute.
- Bild- und Linkziele (src, href) bleiben unverändert – auch interne Links wie /blog/... . Übersetze ausschließlich den sichtbaren Linktext.

CODE – NICHT ÜBERSETZEN
- Der Inhalt von Codeblöcken (\`\`\`abap, \`\`\`sql, \`\`\`cds, \`\`\`bdl, \`\`\`json, eingerückte Blöcke) und von Inline-Code (\`...\`) bleibt zeichengleich stehen.
- Einzige Ausnahme: natürlichsprachige Kommentare *innerhalb* von Code (" ... in ABAP, -- ... in SQL, // ... , /* ... */) werden übersetzt. Bezeichner, Schlüsselwörter, Tabellen- und Feldnamen niemals.

FELDER
- Title: prägnanter englischer Titel. Kein abschließender Punkt.
- Excerpt: der übersetzte Teaser. War das Original leer, gib einen leeren String zurück – erfinde nichts.
- Content: der vollständige übersetzte Beitrag.
- SlugSuggestion: kleingeschrieben, nur a-z, 0-9 und Bindestriche, aus dem englischen Titel abgeleitet, maximal 70 Zeichen. Keine führenden Zahlen-Jahres-Präfixe.`;

const SCHEMA = {
  type: "object",
  properties: {
    Title: { type: "string" },
    Excerpt: { type: "string" },
    Content: { type: "string" },
    SlugSuggestion: { type: "string" },
  },
  required: ["Title", "Excerpt", "Content", "SlugSuggestion"],
  additionalProperties: false,
} as const;

export interface Translation {
  Title: string;
  Excerpt: string;
  Content: string;
  SlugSuggestion: string;
}

/**
 * Entfernt Reste des Prompt-Gerüsts aus der Modellantwort. Die Eingabe ist in
 * <title>/<excerpt>/<content> gewrappt; in Einzelfällen rutscht ein schließender
 * Tag mit ins Ergebnis und landete sonst als Fremdkörper im Markdown.
 */
const sanitize = (s: unknown): string =>
  typeof s === "string" ? s.replace(/<\/?(content|title|excerpt)>/gi, "").replace(/\s+$/, "") : "";

export async function translatePost(
  apiKey: string,
  post: { Title: string; Excerpt: string | null; Content: string },
): Promise<Translation> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Übersetze diesen Blogbeitrag ins Englische.\n\n` +
          `<title>${post.Title ?? ""}</title>\n` +
          `<excerpt>${post.Excerpt ?? ""}</excerpt>\n` +
          `<content>\n${post.Content ?? ""}\n</content>`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error("Der Beitrag ist zu lang — die Antwort wurde abgeschnitten.");
  }
  if (message.stop_reason === "refusal") {
    throw new Error("Die Übersetzung wurde vom Modell abgelehnt.");
  }

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Die Antwort enthielt keinen Text.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.text) as Record<string, unknown>;
  } catch {
    throw new Error("Die Antwort war kein gültiges JSON.");
  }

  return {
    Title: sanitize(parsed.Title),
    Excerpt: sanitize(parsed.Excerpt),
    Content: sanitize(parsed.Content),
    SlugSuggestion: sanitize(parsed.SlugSuggestion),
  };
}
