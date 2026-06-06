interface Props {
  className?: string;
  title?: string;
}

/**
 * Brandeis Consulting logo, inline so CSS can recolor it via `currentColor`.
 * The orange (brand identity) stays fixed; the other shapes pick up text color.
 */
export function BrandeisLogo({ className, title = "Brandeis Consulting" }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 188 233"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path d="m2,232l0,-221l130,72.34l-130,148.66z" fill="#E46C0A" />
      <path d="m186,1l0,221l-130,-72.34l130,-148.66z" fill="currentColor" />
      <path
        d="m56.419266,149.569097l12.16249,6.586383l63.334692,-72.858271l-12.16249,-6.586383l-63.334692,72.858271z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}
