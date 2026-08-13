# Workflow: draft an architecture decision record

This procedure is shared. Claude Code reaches it through `/adr`, Codex through `$adr`. Neither tool restates it.

1. Read `docs/architecture/decisions/README.md`, `docs/architecture/decisions/TEMPLATE.md`, and the existing ADRs so the new record is consistent with accepted decisions and does not silently contradict one.
2. Create the next numbered file in `docs/architecture/decisions/`, named `NNNN-kebab-case-title.md` to match the existing records, using every section of the template.
3. Fill in real content for context, decision, alternatives considered, consequences, security/privacy impact, product-constitution impact, and rollback plan. Leave no template placeholders behind.
4. Set `Status: Proposed` and today's date. Do not set `Status: Accepted` — only a human accepts an ADR.
5. Add the record to the list in `docs/architecture/decisions/README.md`.

Do not implement the decision in the same change. Per `AGENTS.md` section 34, an ADR is a proposal for human review, not authorization to build.
