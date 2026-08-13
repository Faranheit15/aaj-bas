# ADR-0004: Reviewed pull requests on develop

Status: Accepted
Date: 2026-08-13
Owners: Aaj, Bas. maintainers
Accepted by: Faran Mohammad, repository maintainer, in the session that proposed this record.

## Context

ADR-0002 made `develop` the production branch: a push to it runs the check suite and then deploys
both applications to Cloudflare Pages. Until now the repository had a single contributor and no
branch protection at all, so that arrangement was safe by circumstance rather than by control.
Anyone with write access could push straight to production, and a force-push or a branch deletion
would have been accepted.

The repository is now opening to outside contributors, starting with one. The circumstance that made
the arrangement safe no longer holds, and the deployment path needs a control that does not depend on
there being only one person who can push.

The repository is public, so GitHub rulesets, required reviews, and required status checks are
available on the Free plan. No paid tier, account change, or new infrastructure is involved.

## Decision

Protect `refs/heads/develop` with a GitHub repository ruleset, configured in
`docs/runbooks/develop-ruleset.json` and applied with `gh api --input`:

- a pull request is required, with one approving review that must come from a code owner;
- the `check` job must pass;
- `develop` cannot be deleted or force-pushed;
- approvals are dismissed when new commits are pushed;
- the repository-admin role bypasses all of the above.

Code ownership is declared in `.github/CODEOWNERS` as `* @Faranheit15`. Without it,
`require_code_owner_review` would have nothing to match; with it, the requirement names the
maintainer rather than accepting any single approval from anyone with write access.

Contributor-facing expectations live in `CONTRIBUTING.md`, and the private vulnerability reporting
path lives in `SECURITY.md`. The code is released under the MIT licence.

This extends ADR-0002 rather than replacing it. Cloudflare Pages Direct Upload, the two projects, the
job ordering, and the secret handling are all unchanged. What changes is how a commit arrives on
`develop`: previously a direct push, now a reviewed and checked pull request, with an administrative
bypass.

## Alternatives considered

- **No protection, rely on convention.** Rejected. It was already the weakest link once a second
  person had write access, and the failure mode is an unreviewed deployment to production.
- **Classic branch protection instead of a ruleset.** Rejected as the primary mechanism because
  rulesets are GitHub's current model, express bypass explicitly, and can be version-controlled as a
  single JSON document. Classic protection with `enforce_admins: false` is recorded in the runbook as
  the fallback, since admin bypass there is unambiguous.
- **`required_approving_review_count: 1` without code owners.** Rejected. With two contributors it
  happens to behave correctly, but a third contributor would silently make it possible for two
  non-maintainers to approve each other's changes. The stated requirement is the maintainer's
  approval, so the configuration should say that rather than approximate it.
- **No bypass, enforcing the rules on administrators too.** Rejected as unworkable rather than
  undesirable. GitHub does not allow approving your own pull request, so a single maintainer would be
  unable to merge their own work at all. The bypass is what makes a one-person review requirement
  coherent.
- **A `develop` to `main` promotion flow.** Rejected as premature. It solves a release-staging problem
  this project does not yet have, and would double the number of branches to reason about.
- **Requiring the maintainer to run the protection commands, rather than an agent.** Accepted
  deliberately. `gh api` is denied to both agent tools, which is what prevents an agent from altering
  or removing this guard. Keeping that denial intact matters more than the convenience of automating
  a one-time setup.

## Consequences

Reaching production now takes a pull request, a green `check`, and a code-owner approval. For outside
contributors that is the whole path. For the maintainer it is the default path, with a bypass
available when review is impossible or an urgent fix is needed.

Because approvals are dismissed on push, a contributor who responds to review feedback needs a second
approval. This is intended.

The required status check is bound to the job name `check` in `.github/workflows/ci.yml`. Renaming
that job without updating the ruleset would leave every pull request waiting on a status that never
arrives. The runbook records this coupling.

The ruleset is applied by hand from a version-controlled file. Nothing continuously reconciles the
live configuration against `develop-ruleset.json`, so the two can drift; the file records intent, not
observed state. A drift check is not worth building for a single ruleset.

The workflow-level concurrency group was changed at the same time. It previously serialised every run
under one `pages-production` group, which with more than one contributor would have queued unrelated
pull-request runs behind each other and behind production deployments. Pull requests now use a
per-branch group and cancel superseded runs; pushes to `develop` keep the original shared group, so
production deployments remain strictly serialised.

## Security/privacy impact

This strengthens the security model. The production deployment path gains a mandatory human review
and a mandatory passing check, and `develop` becomes resistant to deletion and force-push.

No secret handling changes. Pull requests still receive no deployment credentials, and the deploy
jobs remain gated on `github.event_name == 'push'`, so a pull request cannot reach Cloudflare
regardless of who opens it.

Granting write access to a collaborator widens who can push branches to this repository. It does not
widen who can deploy: the ruleset blocks direct pushes to `develop`, and write access carries no
bypass. Adding the MIT licence grants reuse rights over the code and is not revocable for versions
already published.

## Product-constitution impact

None. This changes how changes are reviewed, not what the product does. No reader-facing behaviour,
content, ranking, or data flow is affected.

## Rollback plan

Set the ruleset to `enforcement: "evaluate"` to keep it reporting without blocking, or delete it with
`DELETE /repos/{owner}/{repo}/rulesets/{id}`. Either returns `develop` to accepting direct pushes.
Remove a collaborator with `DELETE /repos/{owner}/{repo}/collaborators/{username}`. The commands are
in `docs/runbooks/contributions-and-branch-protection.md`.

Deleting the ruleset is fully reversible: reapply `develop-ruleset.json` to restore the identical
configuration. Removing the MIT licence is not — published versions remain licensed.
