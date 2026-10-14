import { META } from '../deck/content.js';

// The deck's mark: bottom-left on every page but the cover, and large on the
// cover if it wants one. Set META.mark in content.js:
//   null                         no mark
//   { text: 'ACME' }             a boxed wordmark set in the deck's sans
//   { src: 'logos/acme.svg', ratio: 2.4 }   a file in public/ (width / height)
// Prefer an inline SVG component here for a real logo, so it stays vector in
// the PDF and can take currentColor.
export default function DeckMark({ height = 28, className = '' }) {
  const mark = META.mark;
  if (!mark) return null;
  if (mark.src) {
    return (
      <img
        className={`deck-mark ${className}`.trim()} src={mark.src} alt={mark.alt ?? ''}
        height={height} width={Math.round(height * (mark.ratio ?? 1))}
      />
    );
  }
  return (
    <span className={`deck-mark is-text ${className}`.trim()} style={{ height, fontSize: height * 0.46 }}>
      {mark.text}
    </span>
  );
}
