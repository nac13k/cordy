## Context

See proposal.md for motivation. The labels live in three kinds of places:

- **Runtime behavior:** `workflow-plan.ts` inserts an extra click with a hard-coded target when the prompt asks to simulate a credit. `expectations.ts` infers a visible-text expectation from one fixed result heading. `jev.ts` rewrites a `fill` proposed on a button into a navigation click, using prompt-verb and button-name regexes and a hard-coded `data-event` selector. This rewrite only runs in prompt mode; plan mode already disables it.
- **Fixtures and assertions** in tests, which quote the labels.
- **Docs and planning artifacts:** `README.md` (English translations), `docs/USAGE.md`, and the active OpenSpec changes.

All work since the last commit is still uncommitted. None of the new features has been committed yet.

## Goals / Non-Goals

**Goals:**
- No original-client label in any file that the next commits will contain.
- Prompt planning and Jev validation that do not depend on any one application.
- One fictional example flow used consistently across docs and tests.

- No original-client label in any commit, commit message, branch, or tag of the GitHub repository after the history cleanup.
- No commit, committer, or tagger identity that exposes the private LAN IP, and no new commit that reintroduces it.
- The owner's personal e-mail appears only in identity fields, never in file contents or commit messages.

**Non-Goals:**
- Changing already published npm versions (immutable; see Risks).
- Changing who authored each commit. Only the leaked e-mail address is corrected; names and authorship stay the same.
- Replacing the Spanish verb rules (`simula`, `calcula`, `llena`, `botón`). They are generic language, not client labels, and the language policy keeps them.
- Removing the generic high-impact name rule (`submit|enviar|simular|continuar|confirmar|calcular|solicitar`).

## Decisions

### Remove the label-bound behavior instead of generalizing it
- **Intermediate click:** deleted. A generic version would have to guess a label that the prompt does not contain. Flows that need an entry click can use a plan file, where the author names it (`- clic en "…"`).
- **Result-heading inference:** deleted, not replaced by a looser pattern such as "una pantalla con …". A looser pattern would invent expectations from vague text, which the README explicitly forbids. `--expect 'text:…'` covers the need.
- **Fill-on-button rewrite:** deleted as a whole, including the prompt-verb check, the name regex, and the `data-event` selector. It existed to recover from one app's entry button. The generic role check that follows already returns `needs_review`. The key-name retargeting heuristic stays, because it depends only on input key names.

Alternative considered: keep the rewrite with configurable labels in `cordy.toml`. Rejected, because plan files now cover this case explicitly and with safer anchoring.

### One neutral fictional flow
All examples use a shipping-quote form: section `Cotizador de envíos`, inputs `peso` and `codigo_postal`, result text `Resumen del envío`, button `Guardar cotización`, slug `cotizar-envio`. English docs use "shipping quote", "Shipment summary", and "Save quote". Spanish prompts that exercise the regexes keep the verbs the planner matches, for example `entra a la sección cotizador de envíos y simula un envío …`. A single consistent flow makes the docs easier to follow than a mix of placeholders.

### Keep the denylist out of the repository
A test that fails when a banned label reappears would itself have to contain those labels. Instead, the verification task checks the working tree against a denylist kept outside the repo (the session scratchpad or a gitignored file), and reports only file names and counts.

### Land before the first commit of the pending work
Every pending change (expectations, file uploads, plan files) and this one are uncommitted. Applying this change first means that none of the new commits contains the labels.

### History cleanup with `git filter-repo`
`git filter-repo` (installed at `/opt/homebrew/bin/git-filter-repo`) is used instead of `git filter-branch` or BFG. It is the tool the Git project recommends, it rewrites file contents and commit messages in one pass, and it refuses to run on a repository that is not a fresh clone.

**Replacement file.** It lives outside the repository (the session scratchpad or a gitignored path) and is never committed. It uses filter-repo's `--replace-text` syntax: one `literal:<old>==><new>` line per label, plus `regex:(?i)<pattern>==><new>` lines for accent and case variants (for example `cr[eé]dito`) and for the English translations used in the README. Replacements map to the neutral flow's wording, so rewritten old commits read consistently. The same file is passed to `--replace-message` to clean commit messages.

**Identity fix.** Git built the address `lumbreras@<LAN IP>` from the host name because neither the repository nor the global config sets `user.email`. It appears in 58 author/committer fields and as the tagger of the annotated `v0.1.0` tag, and nowhere in file contents or commit messages. The owner chose to sign commits with their personal e-mail, the one on their GitHub account and already used as author of the two GitHub merge commits (#1, #2). That address is allowed **only in identity fields** (author, committer, tagger), never in file contents or commit messages. So it is not written anywhere in this change's artifacts either; they call it "the owner's personal address".

A mailmap file, kept outside the repository because it names both addresses, maps the IP-based identity `Lumbreras <lumbreras@<LAN IP>>` to `Lumbreras <owner's personal address>`. The two merge commits already use that address and are left as they are. Names stay the same. filter-repo's `--mailmap` rewrites author, committer, and tagger identities in the same pass. Before the commit in step 1, `git config user.email` is set on the repository to the personal address, so new commits do not reintroduce the IP. The GitHub setting "Block command line pushes that expose my email" must stay **off**, because it would reject these pushes.

**Where it runs.** On a fresh mirror of the local repository (`git clone --mirror --no-local <repo> <scratch>/cordy-rewrite.git`), never on the working copy. The mirror includes every local branch and the `v0.1.0` tag, and it leaves the working copy, `.env`, and the untracked agent folders untouched.

**Order:**
1. Set `user.email` to the chosen address, then apply and commit this change (and the pending feature work) on a local branch, so the tip is already clean.
2. `git bundle create <outside-repo>/cordy-backup-<date>.bundle --all` as a restorable backup.
3. Mirror-clone, then run `git filter-repo --replace-text <file> --replace-message <file> --mailmap <mailmap>` inside the mirror.
4. Verify in the mirror (see below). On any failure, discard the mirror; nothing has been published.
5. **Stop for explicit confirmation** before publishing.
6. In GitHub, disable the "Publish to npm" workflow and temporarily allow force pushes on protected branches.
7. From the mirror, `git push --force <github-remote> 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'`. This pushes exactly the rewritten branches and tags. `--mirror` is avoided because it would also delete remote refs that are missing locally.
8. Re-enable the workflow and branch protection.
9. Replace the working copy: move it aside, re-clone from GitHub, and copy back the gitignored `.env` and the untracked agent folders. Delete the backup bundle only after the new clone passes the checks.

**Verification before publishing:**
- The denylist scan of every blob reachable from every ref (`git rev-list --all` + `git grep`) and of every commit message returns zero matches.
- Every author, committer, and tagger e-mail in every ref is either the owner's personal address or a GitHub/Anthropic service address (`noreply@github.com`, `noreply@anthropic.com`), checked with `git log --all --format='%ae%n%ce'` and `git for-each-ref refs/tags --format='%(taggeremail)'`. No e-mail contains `192.168.`, and author names are unchanged.
- The owner's personal address does not appear in any blob of any ref or in any commit message. It is part of the out-of-repo denylist.
- The tip tree of the branch that holds the neutralized work is byte-identical before and after (`git rev-parse <branch>^{tree}` matches), which proves that the current code was not altered.
- The branch count and tag count are unchanged, and `v0.1.0` still points to the rewrite of the same commit (the same message and parent structure).
- `npm ci && npm test` pass on a checkout of the rewritten main branch.

Alternative considered: squashing everything into a single fresh root commit. Rejected, because it loses the useful history and the PR links.

## Risks / Trade-offs

- [GitHub still serves the old commits through merged PRs #1 and #2 (`refs/pull/*`), cached views, and forks] → A force push cannot update these refs. After the push, ask GitHub Support to remove the cached views and dereference the old commits, listing the PRs and the old commit hashes. The repository is private, which limits exposure in the meantime.
- [Force-pushing the tag republishes to npm] → The publish workflow is disabled during step 7. Even if it ran, npm rejects a version that already exists, so the risk is a failed job, not a new release.
- [A regex replacement over-matches and changes unrelated text] → The rules are anchored to whole phrases, and the tip-tree identity check catches any change to current code. Old commits are compared with `git diff --stat` between the original and rewritten refs, and the diff is reviewed before the push.
- [Collaborators push old history back] → Tell them to re-clone. The history is at risk until then.
- [Published npm tarballs still contain the labels in their README] → They are immutable. `npm deprecate @nac13k/cordy@<versions> "<message>"` (and the same for the old unscoped `cordy` package, if published) points users to a clean version. Whether to deprecate is the owner's decision.
- [Users relying on the removed prompt behavior see different plans] → Called out as BREAKING, with plan files and `--expect` as the migration path in the README.
- [Removing the fill-on-button rewrite can turn a previously recovered run into `needs_review`] → That run was recovering only for the original app. A plan step naming the button is the supported route.

## Migration Plan

1. Apply the code and fixture changes, then update docs and artifacts.
2. Run the denylist check, `format:check`, `typecheck`, `test`, and `build`.
3. Commit this change together with, or before, the pending feature work.
4. Rewrite, verify, and (after confirmation) force-push the history as described above.
5. Rollback before the push: discard the mirror. Rollback after the push: `git clone <backup>.bundle`, then force-push the original refs back, with the publish workflow disabled again.
