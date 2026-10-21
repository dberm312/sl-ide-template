# Template todos

Stable IDs and estimated release gates. **FIRST** = before the first external
user; **SCALE** = before scale; **DONE** = completed. These are recommendations,
not new implementation authorization. See [the workspace map](../TODO.md) for
dependencies, rationale and shared work. Existing deferrals remain recorded below.

# Deferred tests and evals

- [ ] **template-A · FIRST** — Publisher contract suite against a disposable cloud instance: session and
  manifest protocol, checksum failures, interrupted uploads, retries, old-client
  rejection, exact branch identity, unpublishing, slides and memo PDFs.
- [ ] **template-B · SCALE** — Preview-comment checks: branch URL encoding matches cloud, Unicode and
  case round trips, PR open/publish/close lifecycle, no duplicate comments.
- [x] **template-C · DONE** — Browser smoke checks: slide and memo navigation,
  PDF download, live reload preserving the page, comment mode and copy-slide
  capture. `pnpm test:smoke` uses disposable slides/memo fixtures and real
  clipboard/capture checks. All four tests passed in David's local run on
  2026-10-21. [Linear SL-18](https://linear.app/sl-ide/issue/SL-18).
- [ ] **template-D · FIRST** — Restore a reliable layout-audit run and enforce it in publish CI against
  the checked-out commit. Local hooks can be missing or bypassed and can inspect
  unstaged content. Resolve the audit-report failure before making this a required
  publish gate. (Review issue 7; consolidates the former duplicate audit todo.)
- [ ] **template-E · SCALE** — Agent evals: /new-deck and copy edits preserve supplied figures, obey
  content.js ownership and produce pages passing the layout audit.

Other automated suites remain deferred at the user's request; template-C was
explicitly authorized on 2026-10-21; see cloud TODO.md for
cross-repo security coverage.
