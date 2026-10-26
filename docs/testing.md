# Running the tests

Install the dependencies and the Chromium browser once with `npm ci && npx playwright install chromium`. Then run the whole suite with `npm test`, which runs Vitest once and exits. Tests never call the real Jev service, so no API key is needed.
