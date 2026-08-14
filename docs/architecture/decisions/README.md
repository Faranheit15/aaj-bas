# Architecture Decision Records

ADRs document material architecture, dependency, security, privacy, and product-scope decisions. Start with [the template](TEMPLATE.md) and retain superseded decisions for the audit trail.

- [ADR-0001: Initial architecture](0001-initial-architecture.md) — extended by ADR-0002 and ADR-0003; the Cloudflare Pages hosting it records as a future target is now live, and its shared-package list has since gained `packages/logger`.
- [ADR-0002: Cloudflare Pages continuous deployment](0002-cloudflare-pages-continuous-deployment.md) — extended by ADR-0004; reaching `develop` now requires a reviewed pull request, though the deployment it triggers is unchanged. The `VITE_APP_URL` it describes is now the reader's stable production alias rather than the per-commit deployment URL, which is what makes its own rollback plan work; the deployment topology it records is otherwise unchanged.
- [ADR-0003: Shared logging package](0003-logging-package.md)
- [ADR-0004: Reviewed pull requests on develop](0004-reviewed-pull-requests-on-develop.md)
- [ADR-0005: Edition content contract](0005-edition-content-contract.md) — the first public data contract; closes four gaps PRD section 13 left, and fixes the topic vocabulary written into every published edition.
- [ADR-0006: Published content in the reader build](0006-published-content-in-the-reader-build.md) — extends ADR-0002 and ADR-0005; the reader deployment now carries content, `/content/latest.json` becomes a second published artifact, and the AB-103 publish gate is what keeps development sample data out of production.
