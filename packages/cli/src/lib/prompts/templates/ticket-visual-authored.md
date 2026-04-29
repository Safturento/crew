
## Authored Playwright test

If the change has regression value (a user-facing flow that broke before or could break again), add a Playwright test:

- Tests live in **{{testsDir}}/**. Mirror existing files there for style.
- Run them with `{{testCommand}}`. The command must pass before "Verify".
- One test per behaviour, not per assertion. Names describe user intent.
- Don't add a test just because you can. Skip when the change is cosmetic, throwaway, or fully covered by existing unit tests.

If `{{testsDir}}/` doesn't exist or `{{testCommand}}` fails because the runner isn't installed, surface the problem in the PR description and do **not** silently skip — that's a project setup gap, not your fault.
