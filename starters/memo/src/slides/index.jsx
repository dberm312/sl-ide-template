import * as Files from './FilesPage.jsx';
import { flow } from '../components/Flow.jsx';
import { memo } from '../deck/content.js';

const entry = (id, kind, mod, props) => ({
  id, kind, Component: mod.default, title: mod.title, props,
});

// Array order is document order. Kinds: flow (the memo's flowing body, laid
// onto as many pages as it needs: components/Flow.jsx), and fixed pages:
// cover, content, divider, appendix. Appendix labels (A1, A2…) come from
// this order.
const slides = [
  flow('memo', memo.body),
  entry('files', 'appendix', Files),
];

// Page numbers and appendix labels are worked out from this order by
// components/Flow.jsx (pageNumbers, appendixLabels).
export default slides;
