# cordy

Natural-language Playwright automation CLI coordinated by Jev.

> Early local prototype. It is not published to npm and has no remote repository.

## Usage

```bash
npm install
npx playwright install chromium
npm run build

JEV_API_KEY="[REDACTED]" node dist/cli.js \
  "Completa el formulario de registro" \
  --start-url http://127.0.0.1:3000 \
  --input email=ana@example.com \
  --headed
```

Load instructions and inputs from files:

```bash
node dist/cli.js \
  --prompt-file ./task.txt \
  --input ./inputs.json \
  --start-url http://127.0.0.1:3000 \
  --output ./automation.ts
```

The runtime is intentionally ephemeral: task state, observations, actions, approvals, and results exist only for one invocation. No database is used. Generated TypeScript is written only when `--output` is provided.

## Safety boundary

- Jev receives a bounded, redacted browser state and typed questions.
- Jev cannot execute Playwright or generate executable code.
- Playwright executes only validated action types and current-page locator candidates.
- Secret values are represented as input references and are not sent to Jev as raw values.
- The first prototype requires `--start-url` and will add origin allowlists before broader use.
- High-impact actions and ambiguous targets must stop for review.

## Development

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

## License

MIT
