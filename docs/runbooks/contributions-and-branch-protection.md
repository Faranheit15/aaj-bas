# Contributions and branch protection

## Purpose

`develop` is both the default branch and the production branch: a push to it deploys to Cloudflare
Pages. This runbook records how outside contributors are granted access and how `develop` is guarded
so that reaching production requires a reviewed pull request.

The guard is a GitHub **repository ruleset** whose configuration lives in
[`develop-ruleset.json`](develop-ruleset.json), applied with `--input`. Keeping it in Git means the
protection is reviewable in a diff and reproducible from a clean state, rather than being settings
someone once clicked.

This repository is public, so rulesets, required reviews, and required status checks are available on
the GitHub Free plan at no cost.

## One-time setup

**Human only. Agents must not run this section.** Granting repository access and changing branch
protection are repository-administration actions reserved for an authorised human. `.claude/settings.json`
denies `Bash(gh api *)` and `.codex/rules/team.rules` forbids the same for Codex, so an agent that
attempts these commands is denied without further explanation. That denial is intentional: it is the
control that stops an agent from loosening the very guard described here.

### Order matters

GitHub reads `.github/CODEOWNERS` from the **default branch**. Apply the ruleset only after that file
is present on `develop`; otherwise `require_code_owner_review` has no owner to match and pull
requests cannot be approved by anyone. The sequence is:

1. land `.github/CODEOWNERS` and `docs/runbooks/develop-ruleset.json` on `develop`;
2. invite the contributor;
3. apply the ruleset.

### 1. Invite a contributor

```bash
gh api --method PUT /repos/Faranheit15/aaj-bas/collaborators/USERNAME -f permission=push
```

`push` is write access: the contributor can push branches to this repository and open pull requests
from them, but cannot push to `develop` and cannot bypass the ruleset. Only the repository admin can.

Use `triage` instead of `push` for someone who should manage issues and pull requests without code
access. The invitation is pending until the recipient accepts it.

### 2. Apply the develop ruleset

Run from the repository root:

```bash
gh api --method POST /repos/Faranheit15/aaj-bas/rulesets --input docs/runbooks/develop-ruleset.json
```

### 3. Enable private vulnerability reporting

`SECURITY.md` directs reporters to a private advisory, which requires the feature to be on:

```bash
gh api --method PUT /repos/Faranheit15/aaj-bas/private-vulnerability-reporting
```

## What the ruleset enforces

On `refs/heads/develop`, for everyone except the bypass actor:

| Rule | Effect |
| --- | --- |
| `pull_request` | No direct pushes. One approving review, and it must come from a code owner. |
| `required_status_checks` | The `check` and `e2e` jobs must both pass. |
| `deletion` | `develop` cannot be deleted. |
| `non_fast_forward` | `develop` cannot be force-pushed. |

`require_code_owner_review` is what makes the *maintainer's* approval specifically required rather
than any single approval. Ownership is declared in `.github/CODEOWNERS`; without that file, the rule
has nothing to match and no review would be demanded of anyone in particular.

`dismiss_stale_reviews_on_push` clears approvals when new commits arrive, so an approval always
refers to the code that merges.

`strict_required_status_checks_policy` is `false`. GitHub already runs pull-request CI against a
merge preview of the branch into `develop`, so also requiring the branch be up to date would add
rebases without adding real signal.

The required checks are named `check` and `e2e`, which are the job names in
`.github/workflows/ci.yml`. **Renaming either job silently breaks this rule** — the ruleset would
wait for a status that never arrives, and every pull request would be unmergeable. Update both
together.

`e2e` is required separately rather than folded into `check` because it is a separate job by
design. AGENTS.md section 30 and ADR-0010 keep `bun run e2e` out of `bun run check`: `check` is the
local inner loop of every slice and must not need a browser download and a second language runtime.
That makes it two jobs, so it has to be two required contexts — listing only `check` would leave
the end-to-end suite running on every pull request and blocking none of them, which is the failure
mode where a gate exists and enforces nothing.

## The bypass

`bypass_actors` grants `RepositoryRole` 5 — repository admin — `bypass_mode: always`. The maintainer
can therefore push directly to `develop` and merge without waiting for review.

This exists for a specific reason. GitHub does not permit approving your own pull request, so with
code-owner review required and a single maintainer, the maintainer's own pull requests could never
satisfy the rule. The bypass resolves that. It is not a general path around review.

### If the bypass does not work

Repository-admin bypass is the documented route for a repository owned by a personal account, but it
is the part of this configuration most likely to behave differently than expected. A direct push to
`develop` is the real test.

If a push is rejected, either:

1. Downgrade enforcement temporarily so the rules report without blocking, fix, and re-enable:

   ```bash
   gh api --method PUT /repos/Faranheit15/aaj-bas/rulesets/RULESET_ID -f enforcement=evaluate
   ```

2. Or replace the ruleset with classic branch protection, where admin bypass is unambiguous:

   ```bash
   gh api --method PUT /repos/Faranheit15/aaj-bas/branches/develop/protection --input - <<'JSON'
   {
     "required_status_checks": { "strict": false, "contexts": ["check", "e2e"] },
     "enforce_admins": false,
     "required_pull_request_reviews": {
       "required_approving_review_count": 1,
       "require_code_owner_reviews": true,
       "dismiss_stale_reviews": true
     },
     "restrictions": null
   }
   JSON
   ```

   `enforce_admins: false` is what exempts administrators.

## Verifying

These are read-only and an agent session may run them:

```bash
gh ruleset list
gh ruleset view RULESET_ID
gh ruleset check develop
gh repo view --json nameWithOwner,visibility,defaultBranchRef
```

To confirm a pending invitation, check **Settings → Collaborators** in the repository, or the
recipient's notifications.

## Amending the ruleset

Edit `develop-ruleset.json`, get the change reviewed like any other, then replace the live ruleset
with the same file:

```bash
gh ruleset list                                     # find the ID
gh api --method PUT /repos/Faranheit15/aaj-bas/rulesets/RULESET_ID \
  --input docs/runbooks/develop-ruleset.json
```

`PUT` replaces the ruleset wholesale, so the file must always describe the complete intended state.

## Removing protection

```bash
gh api --method DELETE /repos/Faranheit15/aaj-bas/rulesets/RULESET_ID
```

Removing protection returns `develop` to accepting direct pushes from anyone with write access, each
of which deploys to production. Prefer `enforcement=evaluate` for temporary diagnosis, and keep
`develop-ruleset.json` in the repository either way so the intended state is never lost.

To remove a collaborator:

```bash
gh api --method DELETE /repos/Faranheit15/aaj-bas/collaborators/USERNAME
```
