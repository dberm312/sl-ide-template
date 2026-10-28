import SlideShell from '../components/SlideShell.jsx';
import { box } from '../components/geometry.js';
import { appendixDivider } from '../deck/pages/appendixDivider.js';

export const title = appendixDivider.title;

// Section page before the appendix. index.jsx passes the contents list from
// the appendix pages themselves, so it can't drift from their labels.
export default function AppendixDivider({ contents = [] }) {
  return (
    <SlideShell kind="divider">
      <div className="region divider" style={box([0.75, 1.6, 11.83, 4.6])}>
        <h1 className="divider-title">{appendixDivider.title}</h1>
        <ol className="divider-list">
          {contents.map((c) => (
            <li key={c.label}><span className="divider-no">{c.label}</span>{c.short}</li>
          ))}
        </ol>
      </div>
    </SlideShell>
  );
}
