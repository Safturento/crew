
## Authored Playwright test

If the change has regression value (a user-facing flow that broke before or could break again), add a Playwright test:

- Tests live in **{{testsDir}}/**. Mirror existing files there for style.
- Run them with `{{testCommand}}`. If you authored a test, this command must exit 0 before "Verify".
- One test per behaviour, not per assertion. Names describe user intent.
- Don't add a test just because you can. Skip when the change is cosmetic, throwaway, or fully covered by existing unit tests.

**Two crew-managed concerns — do not duplicate:**

- **Do not run `npm run docker:up`.** Crew has the application stack running for you at {{appUrl}}. Running it again will conflict with the live containers.
- **Do not run `npx playwright install`.** Crew has installed Chromium for you before this run. If `{{testCommand}}` reports missing browsers or system libraries, surface the failure in the PR description and stop — that's a crew-setup gap, not your fault.

If `{{testsDir}}/` doesn't exist or `{{testCommand}}` fails for any other reason, also surface the problem in the PR description and do **not** silently skip.
