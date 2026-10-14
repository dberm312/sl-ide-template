// The current lab session. Temporary: when you pick a take, it moves into
// the deck and this file goes back to the idle session below (see
// .claude/skills/slide-lab/SKILL.md).
import './takes.css';

export default {
  slug: 'idle',
  round: 1,
  brief: { title: 'No session', ask: 'Ask your agent for takes on a page (/slide-lab).' },
  takes: [],
  reference: [],
};
