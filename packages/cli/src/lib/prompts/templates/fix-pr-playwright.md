
## Playwright e2e in this worktree

Crew has prepared this worktree for Playwright runs:

- The application stack is running at **{{appUrl}}**.
- Chromium is installed (browser binary + system libs). `process.env.CREW_APP_URL` is set to the app URL.{{authoredClause}}

**Two crew-managed concerns — do not duplicate:**

- **Do not run `npm run docker:up`.** The stack is already up.
- **Do not run `npx playwright install`.** Chromium is already installed.

If `npm run test:e2e` (or the project's equivalent) reports missing browsers, missing system libs, or "no app to test", surface the failure in your fix description and stop — that's a crew-setup gap, not your fault.
