export const checks = {
  title: 'The preview flags crowded or clipped pages as you edit',
  regions: { table: [0.5, 1.45, 12.33, 5.2] },
  head: ['Check', 'What it catches', 'Where you see it'],
  rows: [
    ['CLIPPED', 'Content runs past the footer. Pages are a fixed box, so the PDF would hide it.', 'Rail badge, pnpm run audit'],
    ['SPILL', 'A card or region is too small for its own copy.', 'Rail badge, pnpm run audit'],
    ['OVERLAP', 'Two stacked bands print on top of each other.', 'Rail badge, pnpm run audit'],
    ['WORDY', 'The page is over the word budget (META.wordBudget).', 'Rail word count, audit'],
    ['RAGGED', 'A wrapped line ends in a stub under a third of the width. Advisory.', 'pnpm run audit'],
    ['Fonts', 'A glyph fell back to a system font in the PDF.', 'CI, before publishing'],
  ],
  footer: 'On push, CI runs the audit, prints the PDF and publishes to sl-ide cloud. A failing page stops the publish.',
};
