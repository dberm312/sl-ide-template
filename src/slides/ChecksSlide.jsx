import SlideShell from '../components/SlideShell.jsx';
import { box } from '../components/geometry.js';
import { checks } from '../deck/pages/checks.js';

export const title = checks.title;

// One table: the check, what it catches, where it shows up.
export default function ChecksSlide({ pageNumber }) {
  return (
    <SlideShell title={checks.title} sources={checks.footer} pageNumber={pageNumber}>
      <div className="region" style={box(checks.regions.table)}>
        <table className="table">
          <thead><tr>{checks.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {checks.rows.map(([name, what, where]) => (
              <tr key={name}>
                <td className="ck-name">{name}</td>
                <td>{what}</td>
                <td className="is-muted">{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SlideShell>
  );
}
