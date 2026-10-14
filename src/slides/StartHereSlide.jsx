import SlideShell from '../components/SlideShell.jsx';
import Rich from '../components/Rich.jsx';
import { box } from '../components/geometry.js';
import { startHere } from '../deck/content.js';

export const title = startHere.title;

// Three numbered steps across, each a card: what to do, the command, why.
export default function StartHereSlide({ pageNumber }) {
  return (
    <SlideShell title={startHere.title} sources={startHere.footer} pageNumber={pageNumber}>
      <p className="region lede" style={box([0.5, 1.4, 12.33, 0.5])}>{startHere.lede}</p>
      <ol className="region sh-steps" style={box([0.5, 2.1, 12.33, 3.5])}>
        {startHere.steps.map((s) => (
          <li key={s.n} className="card sh-step">
            <span className="sh-n">{s.n}</span>
            <h3 className="section-title">{s.head}</h3>
            <code className="sh-cmd">{s.cmd}</code>
            <p><Rich text={s.body} /></p>
          </li>
        ))}
      </ol>
    </SlideShell>
  );
}
