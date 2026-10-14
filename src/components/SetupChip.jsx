import { useEffect, useState } from 'react';

// "Setup: 2 steps left" in the dev bar until the deck is set up. The dev
// server answers /__sl-ide/status from scripts/doctor.js, the same checks the
// terminal banner prints on `pnpm dev`. Hover for the next step. Gone once
// everything passes, and absent from the build (there is no server to ask).
export default function SetupChip() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/__sl-ide/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live) setStatus(s); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!status) return null;
  const left = status.checks.filter((c) => !c.ok);
  if (!left.length) return null;
  const tip = left.map((c) => `${c.label}: ${c.fix}`).join('\n');
  return (
    <span className="devbar-setup" data-tip={tip} aria-label={tip}>
      Setup · {left.length} step{left.length > 1 ? 's' : ''} left
    </span>
  );
}
