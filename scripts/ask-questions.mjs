// Every TypeSafe question sl-ide asks (SL-72), with the thresholds and truth
// tables that turn Jev's answers into verdicts. Jev makes the judgments; the
// decisions here are code. scripts/ask.mjs sends the requests.

export const MODELS = {
  // Box questions and images run on jev-preview (docs.typesafe.ai/go/images.md).
  image: 'jev-preview',
  text: 'jev-latest',
};

// A Noul above HIGH reads as yes, below LOW as no; between is unsettled.
export const HIGH = 0.7;
export const LOW = 0.3;

const read = (p) => (p > HIGH ? 'yes' : p < LOW ? 'no' : 'unsure');

// --- fit: does the picture on a page fit it? -------------------------------
// One request per page image; the image is the state, every question reads it.

export const FIT_FLAWS = {
  subject_cut: {
    type: 'noul',
    instructions: 'Is part of the main subject of the picture on `slide` cut off?',
    criteria: {
      true: "Part of what the picture shows, such as a person's head, a product or a screenshot's edge, falls outside the visible picture.",
      false: 'Everything the picture shows is visible, with some space around it.',
    },
  },
  covers_text: {
    type: 'noul',
    instructions: "Does the picture on `slide` cover any of the slide's text?",
    criteria: {
      true: 'The picture sits on top of words, so some letters are hidden or hard to read.',
      false: "All of the slide's text sits clear of the picture.",
    },
  },
  distorted: {
    type: 'noul',
    instructions: 'Does the picture on `slide` look stretched or squashed?',
    criteria: {
      true: 'Circles look like ovals, or people and objects look too wide or too tall.',
      false: 'People and objects in the picture keep their natural proportions.',
    },
  },
};

export function fitQuestions() {
  return {
    picture: {
      type: 'noul',
      instructions: 'Is there a picture on `slide`, such as a photo, an illustration or a screenshot?',
      criteria: {
        true: 'The slide shows a photo, an illustration, a screenshot or another picture.',
        false: 'The slide shows only text, lines, simple shapes, tables, charts, small icons and logos.',
      },
    },
    ...FIT_FLAWS,
    where: { type: 'box', instructions: 'The picture on the slide' },
  };
}

// Answers -> { verdict: fits | misfit | no-picture | unsure, reasons, box }.
export function fitVerdict(answers) {
  const picture = read(answers.picture.noul);
  const flaws = Object.keys(FIT_FLAWS).map((k) => [k, read(answers[k].noul)]);
  const of = (v) => flaws.filter(([, r]) => r === v).map(([k]) => k);
  let verdict;
  if (picture === 'no') verdict = 'no-picture';
  else if (picture === 'unsure') verdict = 'unsure';
  else if (of('yes').length) verdict = 'misfit';
  else if (of('unsure').length) verdict = 'unsure';
  else verdict = 'fits';
  const reasons = verdict === 'misfit' ? of('yes') : verdict === 'unsure' && picture === 'yes' ? of('unsure') : [];
  const b = answers.where.box;
  // The box is only meaningful when there is a picture to locate.
  const box = picture === 'yes' ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right } : null;
  const probabilities = Object.fromEntries(['picture', ...Object.keys(FIT_FLAWS)].map((k) => [k, answers[k].noul]));
  return { verdict, reasons, box, probabilities };
}

// --- find: which pages mention a topic? ------------------------------------
// One request for the deck: every page's text in the state once, one Noul per
// page that refers to it by path.

export const pageKey = (position) => `p${position}`;

export function findState(pages) {
  return {
    pages: Object.fromEntries(pages.map((p) => [pageKey(p.position), { label: p.label, title: p.title, text: p.text }])),
  };
}

export function findQuestions(topic, pages) {
  return Object.fromEntries(pages.map((p) => [pageKey(p.position), {
    type: 'noul',
    instructions: `Does \`pages.${pageKey(p.position)}\` mention ${topic}?`,
    criteria: {
      true: `The page's title or text names ${topic} or talks about it.`,
      false: `The page is about other things and never names ${topic}.`,
    },
  }]));
}

// Answers -> each page's reading, most likely first, and the pages that mention it.
export function findVerdict(answers, pages) {
  const rows = pages.map((p) => {
    const p_ = answers[pageKey(p.position)].noul;
    return { position: p.position, label: p.label, title: p.title, p: p_, verdict: read(p_) };
  }).sort((a, b) => b.p - a.p || a.position - b.position);
  return {
    mentions: rows.filter((r) => r.verdict === 'yes').map((r) => r.label),
    unsure: rows.filter((r) => r.verdict === 'unsure').map((r) => r.label),
    pages: rows,
  };
}
