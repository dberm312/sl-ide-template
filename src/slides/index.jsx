import * as Cover from './CoverSlide.jsx';
import * as StartHere from './StartHereSlide.jsx';
import * as Anatomy from './AnatomySlide.jsx';
import * as Checks from './ChecksSlide.jsx';
import * as Divider from './AppendixDivider.jsx';
import * as Files from './FilesSlide.jsx';
import { files } from '../deck/pages/files.js';

const entry = (id, kind, mod, props) => ({
  id, kind, Component: mod.default, title: mod.title, props,
});

// Appendix pages, in deck order. Their labels (A1, A2…) come from this order,
// and the divider lists them by their `short` names.
const appendix = [
  entry('files', 'appendix', Files),
];
const SHORT = {
  files: files.short,
};

const contents = (pages) =>
  pages.map((s, i) => ({ label: `A${i + 1}`, short: SHORT[s.id] }));

// Array order is deck order. Kinds: cover, content, divider, appendix
// (and flow, for a memo's flowing pages: see components/Flow.jsx).
const slides = [
  entry('cover', 'cover', Cover),
  entry('start-here', 'content', StartHere),
  entry('anatomy', 'content', Anatomy),
  entry('checks', 'content', Checks),
  ...(appendix.length ? [entry('appendix', 'divider', Divider, { contents: contents(appendix) })] : []),
  ...appendix,
];

// Page numbers and appendix labels are worked out from this order by
// components/Flow.jsx (pageNumbers, appendixLabels).
export default slides;
