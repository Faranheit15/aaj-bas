# Architecture Decision Records

ADRs document material architecture, dependency, security, privacy, and product-scope decisions. Start with [the template](TEMPLATE.md) and retain superseded decisions for the audit trail.

- [ADR-0001: Initial architecture](0001-initial-architecture.md) — extended by ADR-0002 and ADR-0003; the Cloudflare Pages hosting it records as a future target is now live, and its shared-package list has since gained `packages/logger`.
- [ADR-0002: Cloudflare Pages continuous deployment](0002-cloudflare-pages-continuous-deployment.md) — extended by ADR-0004; reaching `develop` now requires a reviewed pull request, though the deployment it triggers is unchanged.
- [ADR-0003: Shared logging package](0003-logging-package.md)
- [ADR-0004: Reviewed pull requests on develop](0004-reviewed-pull-requests-on-develop.md)
