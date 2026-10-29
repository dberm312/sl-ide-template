// The current lab session. Temporary: when you pick a take, it moves into
// the deck and this file goes back to the idle session below (see
// .claude/skills/slide-lab/SKILL.md). Each take is its own module with its
// own CSS file, loaded on its own:
//   { id: 'ta', key: 'A', name, axis, idea, changes?, load: () => import('./TakeA.jsx') }
// Today's pages are imported as Component:
//   { id: 'now3', label: '3', name, Component }

export default {
  slug: 'idle',
  round: 1,
  brief: { title: 'No session', ask: 'Ask your agent for takes on a page (/slide-lab).' },
  identity: '',
  mode: 'default',
  takes: [],
  reference: [],
};
