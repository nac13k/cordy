## Why

Cordy's code, tests, and docs still carry the UI labels of the product it was first built against: a section name, an entry button label, a result heading, a call-to-action button, and a `data-event` selector, plus their English translations in the README. Each one is ordinary Spanish on its own, but together they can identify the original client, and they are about to be committed and published. Some of these labels are also hard-coded into runtime behavior, which makes the prompt planner and Jev validation depend on one app instead of being generic.

## What Changes

- **BREAKING (prompt planner):** a prompt that asks to simulate a credit no longer inserts an extra click on a hard-coded entry-button label. The planner only derives generic steps: section navigation, filling the provided inputs, and the final `simular` click.
- **BREAKING (expectation inference):** the rule that inferred a visible-text expectation from one specific result heading is removed. Only the generic `botón …` phrasing is still inferred. Result texts are declared with `--expect 'text:…'`.
- **BREAKING (Jev validation):** the correction that turned a `fill` proposed on a button into a navigation click is removed. It matched prompt verbs and button names from the original app and a hard-coded `data-event` selector. Such a proposal now yields `needs_review`, like any other incompatible role.
- Docs, examples, and tests switch to one neutral, fictional flow: a shipping-quote form with a `Cotizador de envíos` section, `peso` and `codigo_postal` inputs, a `Resumen del envío` result, and a `Guardar cotización` button. The example test slug used in docs and tests becomes `cotizar-envio`, including in the `--test-name` validation message.
- Spanish example prompts stay Spanish where they exercise the planner regexes, as the project language policy requires.
- **History cleanup:** after the working tree is clean and committed, every branch and tag is rewritten with `git filter-repo`, replacing the old labels in file contents and commit messages with the neutral flow's wording. The rewritten history is then force-pushed to GitHub. The same pass fixes commit identities: 29 commits (as author and committer) and the `v0.1.0` tag use an auto-generated e-mail that exposes a private LAN IP (`<user>@192.168.x.x`), because the repository has no `user.email` configured. A mailmap rewrites that identity to the owner's personal e-mail, the one already used by the two GitHub merge commits, and `user.email` is set to it so new commits do not repeat the IP. That address is allowed only as a commit identity (author, committer, tagger), never in file contents or commit messages. The replacement list and the mailmap stay outside the repository, a backup bundle is kept until the push is verified, and the force push only happens after explicit confirmation.
- Out of scope: already published npm versions, which are immutable and still contain the old labels in their README. The design lists the options (`npm deprecate`).

## Capabilities

### New Capabilities
- `prompt-planning`: What the Spanish prompt planner and expectation inference derive from a prompt, with the guarantee that neither depends on labels of a specific application.
- `jev-action-validation`: How Cordy handles a Jev proposal whose action is incompatible with the target's role, without app-specific rewrites.

### Modified Capabilities
<!-- None: the affected behavior has no main spec under openspec/specs/ yet. -->

## Impact

- **Code:** `src/workflow-plan.ts` (drop the intermediate hard-coded click), `src/expectations.ts` (drop the domain-specific visible-text rule), `src/jev.ts` (drop the fill-on-button navigation correction), `src/cli-options.ts` (example slug in an error message).
- **Tests:** `workflow-plan`, `expectations`, `jev`, `observe`, `output`, `cli-options`, `app`, `managed-output`, `run-output`, `run-plan`, `input-actions`, `expectation-spec`. Fixtures are rewritten to the neutral flow, and assertions about the removed behavior are replaced by assertions about the new behavior.
- **Docs:** `README.md` and `docs/USAGE.md` examples, including the English translations.
- **OpenSpec artifacts:** active changes that quote the old labels (`natural-language-plan`, `managed-named-tests`) are reworded.
- **Git history (BREAKING for clones):** all commit hashes change on `main`, `feat/managed-named-tests`, `chore/remove-client-references`, `fix/scoped-package-imports`, and the tag `v0.1.0`. Existing clones must be re-cloned or hard-reset. GitHub keeps the old commits reachable through the merged pull requests (#1, #2) until GitHub Support purges them.
- **CI:** force-pushing the rewritten `v0.1.0` tag triggers the tag-based publish workflow. It must be disabled during the push.
- **Users:** prompts that relied on the implicit entry click, the inferred result heading, or the fill-to-click correction must use a plan file (`--plan`) or explicit `--expect` flags instead.
