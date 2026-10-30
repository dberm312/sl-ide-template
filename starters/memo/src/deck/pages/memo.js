export const memo = {
  body: [
    {
      memohead: [
        ['To', 'Whoever opens this project first'],
        ['From', 'sl-ide'],
        ['Date', 'October 2026'],
        ['Re', 'How a memo is built here, and what to replace first'],
      ],
    },
    { h1: 'Write the memo as blocks; the pages take care of themselves' },
    'This project is a **memo**: US Letter pages, portrait, printed to a vector PDF. You write the body as a list of blocks in **src/deck/pages/memo.js** and the paginator lays them onto as many pages as they need. You never move a paragraph to the next page by hand.',
    'Everything else works as it does for slides. The preview updates as you save, comment mode (press **c**) points your agent at any element, and the audit runs before every commit. On every push, CI prints the PDF and publishes the memo to sl-ide cloud.',

    { h2: 'Start here' },
    {
      ol: [
        'Run **pnpm skills** to restore impeccable, copy-editing and copywriting, unless you have them installed globally.',
        'Run **/sl-ide-setup**. Impeccable asks who the memo is for and what it must do (PRODUCT.md), then learns the style from your brand (DESIGN.md and the tokens).',
        'Ask for the memo in plain words, or paste a draft. It lands in **memo.body** as blocks, and the preview pages it as you go.',
        'Run **/sl-ide-copy-pass** to tighten the words, then **/sl-ide-ship** to audit, print and commit.',
      ],
    },

    { h2: 'What a block can be' },
    'A string is a paragraph. Everything else is an object whose key names the block. Paragraphs, lists and tables can break across pages; the rest stay whole.',
    {
      table: {
        head: ['Block', 'Written as', 'Across a page break'],
        widths: ['22%', '42%', '36%'],
        rows: [
          ['Paragraph', "a plain 'string'", 'Splits between lines, two lines at least on each side'],
          ['Heading', '{ h1 }, { h2 }, { h3 }', 'Stays with the first lines below it'],
          ['List', '{ ul: [...] } or { ol: [...] }', 'Splits between items; numbering carries on'],
          ['Table', '{ table: { head, rows, widths } }', 'Splits between rows; the header repeats'],
          ['Callout', '{ callout }', 'Stays whole'],
          ['Memo head', '{ memohead: [[label, value]] }', 'Stays whole'],
          ['Exhibit', '{ exhibit: Component, props }', 'Stays whole; any React component'],
          ['Page break', '{ pageBreak: true }', 'Starts a new page'],
        ],
      },
    },
    { callout: '**Placeholders stay visible.** A fact you still need, like [TBD: the launch date], prints exactly as written on the highlight until someone supplies it. Never let an agent invent the figure.' },

    { h2: 'How the paginator decides' },
    'It renders every block once, off screen, at print size and in the memo’s own fonts, and measures each one. Then it deals the blocks onto pages from the top. When a paragraph won’t fit, it breaks at a line, never leaving a single line alone at the foot or the head of a page. When a heading would land at the bottom of a page with nothing under it, it moves to the next page with its text.',
    'The pages it makes are ordinary pages. The rail, the sorter, the viewer and the PDF all show the same render, so what you see in the preview is what prints.',

    { h2: 'Fixed pages' },
    'Some pages shouldn’t flow: a cover, a full-page chart, an appendix table. Those are components placed in inch boxes, exactly like slides, and they sit in **src/slides/index.jsx** before or after the flowing body. The appendix page at the end of this memo is one. Appendix pages are labelled A1, A2 and so on, in order.',

    { h2: 'Checks' },
    'Run **pnpm run audit** before calling the memo done. Flowing pages are checked for anything that runs past the footer and for a region too small for its copy. Fixed pages get the same checks as slides. Across the whole memo, LONG flags a memo over **META.pageBudget** pages. CI runs it again on every push and won’t publish a failing memo.',
    'Look at the pages with **pnpm shots**, and print with **pnpm pdf**. The PDF is US Letter, with selectable text and the fonts embedded.',
  ],
};
