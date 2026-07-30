import styles from "../styles/gatsby/ailabel.module.scss";

/**
 * Kennzeichnung KI-erzeugter Inhalte.
 *
 * Portiert aus brandeis-academy/src/components/ailabel.js (ADR-004: kopieren
 * statt nachbauen, damit die Vorschau der Live-Site entspricht). Einziger
 * Unterschied: die Sprache kommt hier als Prop statt aus dem i18n-Singleton,
 * den der Editor nicht hat — sie richtet sich nach der Sprache des Beitrags.
 *
 * ⚠ Texte und SVG bei Änderungen in **beiden** Dateien nachziehen.
 */

interface Props {
  text?: boolean;
  images?: boolean;
  videos?: boolean;
  audios?: boolean;
  dark?: boolean;
  locale?: string;
}

function Icon({ dark }: { dark: boolean }) {
  return !dark ? (
    <svg data-name="Calque 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 566.93 566.93">
      <path fillRule="evenodd" d="M272.03,100.72c100.92,0,182.74,81.82,182.74,182.75s-81.82,182.74-182.74,182.74-182.75-81.82-182.75-182.74,81.82-182.75,182.75-182.75" />
      <path fill="#fff" d="M170.79,353.74c-1.08,0-2.05-.43-2.92-1.31-.88-.87-1.31-1.84-1.31-2.92,0-.67.07-1.27.2-1.81l47.34-129.32c.4-1.48,1.24-2.79,2.52-3.93,1.27-1.14,3.05-1.71,5.34-1.71h29.81c2.28,0,4.06.57,5.34,1.71,1.27,1.14,2.11,2.45,2.52,3.93l47.14,129.32c.27.54.4,1.14.4,1.81,0,1.08-.44,2.05-1.31,2.92s-1.91,1.31-3.12,1.31h-24.78c-2.01,0-3.52-.5-4.53-1.51-1.01-1.01-1.65-1.91-1.91-2.72l-7.86-20.55h-53.78l-7.65,20.55c-.27.81-.88,1.71-1.81,2.72-.94,1.01-2.55,1.51-4.83,1.51h-24.78ZM218.13,299.96h37.47l-18.93-53.18-18.53,53.18Z" />
      <path fill="#fff" d="M328.11,353.74c-1.48,0-2.69-.47-3.63-1.41-.94-.94-1.41-2.15-1.41-3.63v-130.93c0-1.48.47-2.68,1.41-3.63s2.15-1.41,3.63-1.41h26.99c1.48,0,2.68.47,3.63,1.41.94.94,1.41,2.15,1.41,3.63v130.93c0,1.48-.47,2.69-1.41,3.63-.94.94-2.15,1.41-3.63,1.41h-26.99Z" />
    </svg>
  ) : (
    <svg data-name="Calque 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 566.93 566.93">
      <path fillRule="evenodd" fill="#fff" d="M272.03,100.72c100.92,0,182.74,81.82,182.74,182.75s-81.82,182.74-182.74,182.74-182.75-81.82-182.75-182.74,81.82-182.75,182.75-182.75" />
      <path d="M170.79,353.74c-1.08,0-2.05-.43-2.92-1.31-.88-.87-1.31-1.84-1.31-2.92,0-.67.07-1.27.2-1.81l47.34-129.32c.4-1.48,1.24-2.79,2.52-3.93,1.27-1.14,3.05-1.71,5.34-1.71h29.81c2.28,0,4.06.57,5.34,1.71,1.27,1.14,2.11,2.45,2.52,3.93l47.14,129.32c.27.54.4,1.14.4,1.81,0,1.08-.44,2.05-1.31,2.92s-1.91,1.31-3.12,1.31h-24.78c-2.01,0-3.52-.5-4.53-1.51-1.01-1.01-1.65-1.91-1.91-2.72l-7.86-20.55h-53.78l-7.65,20.55c-.27.81-.88,1.71-1.81,2.72-.94,1.01-2.55,1.51-4.83,1.51h-24.78ZM218.13,299.96h37.47l-18.93-53.18-18.53,53.18Z" />
      <path d="M328.11,353.74c-1.48,0-2.69-.47-3.63-1.41-.94-.94-1.41-2.15-1.41-3.63v-130.93c0-1.48.47-2.68,1.41-3.63s2.15-1.41,3.63-1.41h26.99c1.48,0,2.68.47,3.63,1.41.94.94,1.41,2.15,1.41,3.63v130.93c0,1.48-.47,2.69-1.41,3.63-.94.94-2.15,1.41-3.63,1.41h-26.99Z" />
    </svg>
  );
}

export function AiLabel({
  text = false,
  images = false,
  videos = false,
  audios = false,
  dark = false,
  locale = "de",
}: Props) {
  const isde = locale !== "en";

  const content =
    text && !images && !videos && !audios
      ? isde
        ? "Folgende Texte wurden teilweise oder vollständig mit Hilfe generativer KI-Modelle erzeugt."
        : "The following texts were partially or completely generated with the help of generative AI models."
      : !text && images && !videos && !audios
        ? isde
          ? "Bei den Bildern auf dieser Seite handelt es sich teilweise oder vollständig um Produkte textgesteuerter Bildsynthese mittels KI."
          : "The images on this page are partially or completely products of text-controlled image synthesis using AI."
        : !text && !images && videos && !audios
          ? isde
            ? "Bei den Videos auf dieser Seite handelt es sich teilweise oder vollständig um Produkte textgesteuerter Videosynthese mittels KI."
            : "The videos on this page are partially or completely products of text-controlled video synthesis using AI."
          : !text && !images && !videos && audios
            ? isde
              ? "Bei den Audios auf dieser Seite handelt es sich teilweise oder vollständig um Produkte textgesteuerter Audiosynthese mittels KI."
              : "The audio files on this page are partially or completely products of text-controlled audio synthesis using AI."
            : text
              ? isde
                ? "Folgende Texte und Inhalte auf dieser Seite wurden teilweise oder vollständig mit Hilfe generativer KI-Modelle erzeugt."
                : "The following texts and content on this page were partially or completely generated with the help of generative AI models."
              : images || videos || audios
                ? isde
                  ? "Medien auf dieser Seite wurden teilweise oder vollständig mit Hilfe generativer KI-Modelle synthetisiert."
                  : "Media on this page were partially or completely synthesized with the help of generative AI models."
                : isde
                  ? "Folgende Inhalte auf dieser Seite wurden teilweise oder vollständig mit Hilfe generativer KI-Modelle erzeugt."
                  : "The following content on this page was partially or completely generated with the help of generative AI models.";

  return (
    <div className={`${styles.aiLabel}${dark ? ` ${styles.dark}` : ""}`}>
      <Icon dark={dark} />
      <p>{content}</p>
    </div>
  );
}
