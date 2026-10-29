import SlideShell from '../components/SlideShell.jsx';
import Rich from '../components/Rich.jsx';
import { box } from '../components/geometry.js';
import { PRELIMINARY } from '../deck/content.js';
import { anatomy } from '../deck/pages/anatomy.js';

export const title = anatomy.title;

// Bullets on the left, a stack of cards on the right: the two most common
// page shapes, and the pattern for placing regions from its page module.
export default function AnatomySlide({ pageNumber }) {
  const { regions } = anatomy;
  return (
    <SlideShell title={anatomy.title} titleTag={PRELIMINARY} sources={anatomy.footer} pageNumber={pageNumber}>
      <div className="region" style={box(regions.left)}>
        <h2 className="section-title">{anatomy.leftHead}</h2>
        <ul className="bullets">
          {anatomy.points.map((p) => <li key={p}><Rich text={p} /></li>)}
        </ul>
      </div>
      <div className="region an-cards fill" style={box(regions.right)}>
        <h2 className="section-title">{anatomy.rightHead}</h2>
        {anatomy.cards.map((c) => (
          <div key={c.head} className={`card${c.outline ? ' is-outline' : ''}`}>
            <h3>{c.head}</h3>
            <p><Rich text={c.body} /></p>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}
