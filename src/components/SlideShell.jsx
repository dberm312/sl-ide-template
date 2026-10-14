import { META, ZONES } from '../deck/content.js';
import { box } from './geometry.js';
import Rich from './Rich.jsx';
import DeckMark from './DeckMark.jsx';

// A balanced two-line title will happily break "add-on" at its hyphen. Hold
// hyphenated words and en-dash ranges ("2–3") together.
function KeepWords({ text }) {
  return text.split(/(\S+[-–]\S+)/).map((part, i) => (
    i % 2 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{part}</span> : part
  ));
}

// Every page goes through here, so the title zone, the sources footer and the
// page chrome are placed once, from ZONES in content.js.
//   'cover'    no title zone, no page number, no footer mark
//   'content'  action title, sources, numbered
//   'appendix' as content, but numbered A1, A2… (the caller passes the label)
//   'divider'  section page: no title zone, no page number
// A page with a two-line title passes a taller `titleZone`.
// The footer mark is MARK_H tall; text beside it starts MARK_INDENT in.
const MARK_H = 28;
const MARK_INDENT = META.mark ? 64 : 0;

export default function SlideShell({ kind = 'content', title, titleZone = ZONES.title, titleTag, sources, pageNumber, className = '', children }) {
  const zone = box(ZONES.footer);
  const sourcesBox = { ...zone, left: zone.left + MARK_INDENT, width: zone.width - MARK_INDENT };
  return (
    <section className={`slide ${kind} ${META.watermark ? 'has-draft' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
      {/* The draft tab sits in the top-right corner of every page while
          META.watermark is set. Excluded from the audit's word count. */}
      {META.watermark && (
        <div className="corner-flags">
          <div className="draft-flag" data-artifact>{META.watermark}</div>
        </div>
      )}
      {(kind === 'content' || kind === 'appendix') && (
        <h1 className="region action-title" style={box(titleZone)}><KeepWords text={title} /></h1>
      )}
      {/* A consulting-style sticker at the right of the title: "Preliminary",
          "Illustrative" and the like. */}
      {titleTag && (
        <div className="title-sticker"><b>{titleTag.head}</b>{titleTag.sub && <span>{titleTag.sub}</span>}</div>
      )}
      {children}
      {sources && (
        <p className="region sources" style={sourcesBox}><Rich text={sources} /></p>
      )}
      {kind !== 'cover' && META.mark && <DeckMark height={MARK_H} />}
      <div className="slide-footer" style={{ left: box(ZONES.footer).left + MARK_INDENT }}>
        <span>{kind === 'cover' ? '' : [META.author, META.deckTitle, META.date].filter(Boolean).join(' · ')}</span>
        <span className="footer-page">{kind === 'cover' ? '' : pageNumber}</span>
      </div>
    </section>
  );
}
