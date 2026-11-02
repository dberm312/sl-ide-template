// Compile-time regressions for the contracts used by decks and the editor.
import { flow } from '../../src/components/Flow';
import { box } from '../../src/components/geometry.js';
import type { DeckMeta, FixedEntry, MemoBlock } from '../../src/components/types';

const blocks: MemoBlock[] = [
  'Paragraph', { p: 'Text' }, { h1: 'Heading' }, { h2: 'Heading' }, { h3: 'Heading' },
  { ul: ['One'] }, { ol: ['One'] }, { callout: 'Note' }, { memohead: [['To', 'Reader']] },
  { table: { head: ['Column'], rows: [['Cell']], widths: ['100%'] } },
  { exhibit: () => null, props: { anything: true } }, { pageBreak: true },
];
flow('memo', blocks);
box([0, 0, 6.5, 9]);
const meta: DeckMeta = { deckTitle: 'A deck', format: 'memo', mark: { src: 'mark.svg', ratio: 2 } };
void meta;
// @ts-expect-error Geometry needs four dimensions.
box([0, 0, 6.5]);
// @ts-expect-error Table rows contain text cells.
flow('memo', [{ table: { rows: [[42]] } }]);
// @ts-expect-error List items are text.
flow('memo', [{ ul: [42] }]);
// @ts-expect-error A forced page break is explicitly true.
flow('memo', [{ pageBreak: false }]);
// @ts-expect-error A fixed page needs a component.
const missingComponent: FixedEntry = { id: 'page', kind: 'content', title: 'Page' };
void missingComponent;
