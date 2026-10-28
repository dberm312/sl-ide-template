export const anatomy = {
  title: 'Each page is a copy module placed in inch boxes',
  regions: {
    left: [0.5, 1.45, 6.1, 5.2],
    right: [6.95, 1.45, 5.88, 5.2],
  },
  leftHead: 'How a page is made',
  points: [
    '**src/deck/pages/** holds each page’s words and boxes, one module a page.',
    '**One component per page** in src/slides/; index.jsx sets the order and the appendix.',
    '**Tokens only**: colour and type live on :root in styles.css, never in a slide.',
    '**Action titles** state the page’s point, so the titles alone tell the story.',
    'Open facts stay visible: [TBD: a figure you still need] prints as written.',
  ],
  rightHead: 'Building blocks',
  cards: [
    { head: 'Region', body: 'A box placed by box([x, y, w, h]); the audit flags copy that overflows it.' },
    { head: 'Card', body: 'A filled panel for one idea. Give it the card class so the audit measures it.' },
    { head: 'Sticker', body: 'A titleTag such as PRELIMINARY marks a page as a first pass.', outline: true },
  ],
  footer: 'Source: sl-ide starter. The outlined card shows the one-per-page emphasis pattern: an outline, not a fill.',
};
