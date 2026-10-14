import SlideShell from '../components/SlideShell.jsx';
import DeckMark from '../components/DeckMark.jsx';
import { box } from '../components/geometry.js';
import { cover, META } from '../deck/content.js';

export const title = cover.title;

// Title and byline top left, the mark large beneath them, and the deck in
// brief in the right column.
export default function CoverSlide() {
  return (
    <SlideShell kind="cover">
      <div className="region cover-left" style={box([0.75, 0.9, 6.5, 3.2])}>
        <p className="cover-kicker">{cover.kicker}</p>
        <h1 className="cover-title">{META.deckTitle}</h1>
        <p className="cover-by">Prepared by {META.author} · {META.date}</p>
      </div>
      <div className="region cover-mark" style={box([0.75, 4.6, 6.5, 2.15])}>
        <DeckMark height={96} />
      </div>
      <div className="region cover-brief" style={box([7.55, 1.5, 5.28, 5.25])}>
        <h2 className="eyebrow">{cover.inBriefHead}</h2>
        <ul className="cover-list">
          {cover.inBrief.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </SlideShell>
  );
}
