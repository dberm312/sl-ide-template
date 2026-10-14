import { rich } from '../deck/content.js';

// Renders the content module's **bold** markup.
// A [CONFIRM: …] or [TBD: …] placeholder prints exactly as written, on the
// confirm highlight, so an open ask is never mistaken for finished copy.
const CONFIRM = /(\[(?:CONFIRM|TBD):[^\]]*\])/;

function Plain({ text }) {
  return text.split(CONFIRM).map((part, i) => (
    i % 2 ? <span key={i} className="confirm">{part}</span> : part
  ));
}

export default function Rich({ text }) {
  return rich(text).map((seg, i) => (
    seg.bold ? <b key={i}>{seg.text}</b> : <Plain key={i} text={seg.text} />
  ));
}
