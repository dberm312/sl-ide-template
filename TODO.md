# Deferred tests and evals

- [ ] Publisher contract suite against a disposable cloud instance: session and
  manifest protocol, checksum failures, interrupted uploads, retries, old-client
  rejection, exact branch identity, unpublishing, slides and memo PDFs.
- [ ] Preview-comment checks: branch URL encoding matches cloud, Unicode and
  case round trips, PR open/publish/close lifecycle, no duplicate comments.
- [ ] Browser smoke checks: slide and memo navigation, PDF download, live reload
  preserving the page, comment mode and copy-slide capture.
- [ ] Restore a reliable layout-audit run and enforce it in CI before publishing.
- [ ] Agent evals: /new-deck and copy edits preserve supplied figures, obey
  content.js ownership and produce pages passing the layout audit.

Automated suites are deferred at the user's request; see cloud TODO.md for
cross-repo security coverage.

## Medium-severity findings

- [ ] Run the layout audit in publish CI against the checked-out commit. Local
  hooks can be missing or bypassed and can inspect unstaged working-tree content,
  so they cannot prove the published commit passed. Resolve the audit-report
  failure before making this a required publish gate. (Review issue 7.)
