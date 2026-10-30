export const startHere = {
  title: 'Three steps take this starter to your first real deck',
  lede: 'Open your coding agent in this folder, keep pnpm dev running, and work through these in order.',
  steps: [
    {
      n: '1',
      head: 'Install the skills',
      cmd: 'pnpm skills',
      body: 'Restores **impeccable**, **copy-editing** and **copywriting** from skills-lock.json into gitignored project folders. If you have them installed globally, there is nothing to do here.',
    },
    {
      n: '2',
      head: 'Learn the style',
      cmd: '/sl-ide-setup',
      body: 'Impeccable interviews you for **PRODUCT.md** (audience, purpose, constraints), then reads your brand from a site, PDF or guide and writes **DESIGN.md** and the tokens.',
    },
    {
      n: '3',
      head: 'Build the slides',
      cmd: 'ask in plain words',
      body: 'Ask for pages and they land in the preview. Press **c** to comment on any element, **/sl-ide-lab** to compare takes and **/sl-ide-ship** to audit, print and commit the deck.',
    },
  ],
  // sl-ide wraps the agent; the agent edits the pages. Marks in slides/agentLogos.js.
  agentsHead: 'Works with',
  agents: [
    { maker: 'Anthropic', marks: [['claude', 'Claude'], ['claude-code', 'Claude Code']] },
    { maker: 'OpenAI', marks: [['chatgpt', 'ChatGPT'], ['codex', 'Codex']] },
  ],
  agentsNote: 'and any AI agent, natively',
  footer: 'Codex users: invoke skills as $sl-ide-setup, $sl-ide-lab and so on. The terminal under pnpm dev and the setup chip in the dev bar show which steps are left.',
};
