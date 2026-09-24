## 1. Runtime behavior

- [x] 1.1 Remove the hard-coded intermediate click from `createWorkflowPlan` in `src/workflow-plan.ts`. Rewrite `test/workflow-plan.test.ts` to the shipping-quote prompts from the `prompt-planning` scenarios, and verify that the steps are navigation, fill, and the final `simular` click only
- [x] 1.2 Remove the fixed result-heading rule from `inferExpectations` in `src/expectations.ts`. Rewrite `test/expectations.test.ts` so it asserts the button inference and that no text is inferred from a result heading, and verify it passes
- [x] 1.3 Remove the fill-on-button navigation rewrite from `JevClient.nextAction` in `src/jev.ts` (prompt-verb check, name regex, and `data-event` selector), keeping the key-name retargeting. Replace the `test/jev.test.ts` cases that relied on it with the two `jev-action-validation` scenarios plus the key-name retargeting scenario, and verify they pass
- [x] 1.4 Change the example slug in the `--test-name` error message in `src/cli-options.ts` to `cotizar-envio`, and verify with `test/cli-options.test.ts`

## 2. Test fixtures

- [x] 2.1 Rewrite the remaining fixtures that quote the old labels (`observe`, `output`, `cli-options`, `app`, `managed-output`, `run-output`, `run-plan`, `input-actions`, `expectation-spec`) to the shipping-quote flow and the `cotizar-envio` slug, keeping each test's intent. Verify with `npm test`

## 3. Docs and planning artifacts

- [x] 3.1 Rewrite the examples in `README.md` (including the English translations) and `docs/USAGE.md` to the shipping-quote flow. Update the "Expectations inferred from the prompt" section to show button inference only, and add a migration note for the three removed behaviors. Verify by reading the rendered sections
- [x] 3.2 Reword the active OpenSpec changes that quote the old labels (`natural-language-plan`, `managed-named-tests`) and verify with `openspec validate --strict` for each

## 4. Verification

- [ ] 4.1 Check every tracked and untracked (not ignored) file against a denylist of the old labels, their translations, and the owner's personal e-mail, kept outside the repository. Report only file names and counts, and verify zero matches
- [ ] 4.2 Run `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`, all passing

## 5. History cleanup with git filter-repo

- [x] 5.0 Set `user.email` for this repository to the owner's personal address (the one on the GitHub account), and verify with `git var GIT_AUTHOR_IDENT` that the identity uses it and contains no host name or IP. Do not write the address into any repository file
- [ ] 5.1 Commit the neutralized working tree (with the pending feature work) on a local branch, and verify the working tree is clean except for gitignored files and the untracked agent folders
- [ ] 5.2 Write the replacement file and the mailmap outside the repository. The replacement file has literal and `regex:` rules for the old labels, their accent and case variants, and their English translations, mapped to the neutral flow. The mailmap maps the IP-based identity to the personal address from 5.0, keeping names; the two merge commits already use that address and stay as they are. Verify neither file is inside the repo or staged
- [ ] 5.3 Create a backup bundle of all refs outside the repository, and verify it with `git bundle verify`
- [ ] 5.4 Mirror-clone the local repository into the scratchpad and run `git filter-repo --replace-text <file> --replace-message <file> --mailmap <mailmap>` there. Verify that the command succeeds and that the working copy is untouched
- [ ] 5.5 Verify the mirror: zero denylist matches across all blobs of all refs and all commit messages; every author, committer, and tagger e-mail is the owner's personal address or a GitHub/Anthropic service address, none contains `192.168.`, and author names are unchanged; the personal address appears in no blob and no commit message; the tip tree of the neutralized branch is unchanged; branch and tag counts are unchanged; `npm ci && npm test` pass on a checkout of the rewritten main branch; review `git diff --stat` between the original and rewritten refs
- [ ] 5.6 Stop and get explicit confirmation from the owner before publishing, showing the verification results and the list of refs to be force-pushed
- [ ] 5.7 With the "Publish to npm" workflow disabled and force pushes allowed, force-push the rewritten branches and tags (`refs/heads/*`, `refs/tags/*`, never `--mirror`), then restore both settings. Verify with `git ls-remote` that the remote refs match the mirror
- [ ] 5.8 Replace the working copy with a fresh clone from GitHub, restore `.env` and the untracked agent folders, and run the full checks. Verify the denylist scan of the new clone returns zero matches, then delete the backup bundle
- [ ] 5.9 Draft the GitHub Support request to purge cached views and PR references (#1, #2) with the old commit hashes, and hand it to the owner
