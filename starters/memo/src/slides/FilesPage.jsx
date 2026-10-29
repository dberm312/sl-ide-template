import SlideShell from '../components/SlideShell.jsx';
import { box } from '../components/geometry.js';
import { files } from '../deck/pages/files.js';

export const title = files.title;

// A fixed page in a memo: an appendix table placed in an inch box, numbered
// A1 in the footer.
export default function FilesPage({ appendixLabel }) {
  return (
    <SlideShell kind="appendix" title={files.title} sources={files.sources} pageNumber={appendixLabel}>
      <div className="region" style={box(files.regions.table)}>
        <table className="table memo-table">
          <tbody>
            {files.rows.map(([path, what]) => (
              <tr key={path}><td className="fl-path">{path}</td><td>{what}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </SlideShell>
  );
}
