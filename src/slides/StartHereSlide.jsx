import SlideShell from '../components/SlideShell.jsx';
import Rich from '../components/Rich.jsx';
import { box } from '../components/geometry.js';
import { startHere } from '../deck/pages/startHere.js';
import { AGENT_LOGOS } from './agentLogos.js';

export const title = startHere.title;

// Three numbered steps across, each a card: what to do, the command, why.
// Beneath them, the agents that can drive the deck, grouped by maker.
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
      <div className="region sh-agents" style={box([0.5, 5.85, 12.33, 0.6])}>
        <h2 className="eyebrow">{startHere.agentsHead}</h2>
        {startHere.agents.map((g) => (
          <ul key={g.maker} aria-label={g.maker}>
            {g.marks.map(([id, name]) => (
              <li key={id}><AgentLogo id={id} />{name}</li>
            ))}
          </ul>
        ))}
        <p>{startHere.agentsNote}</p>
      </div>
    </SlideShell>
  );
}

function AgentLogo({ id }) {
  const { d, evenodd } = AGENT_LOGOS[id];
  const rule = evenodd ? 'evenodd' : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="currentColor" fillRule={rule} clipRule={rule} />
    </svg>
  );
}
