
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. Crew already generated `{{collectionDir}}/environments/{{envName}}.bru` (pointing at **{{baseUrl}}**) for the original run. `CREW_BRUNO_ENV={{envName}}` is set in your env.

While applying feedback:

- If your fix touches any HTTP endpoint behaviour, update the matching `{{collectionDir}}/endpoints/...` and (where relevant) `{{collectionDir}}/flows/...` files in the same set of commits.
- Before pushing, run `npm run bruno:smoke`. Smoke must pass. A connection error usually means the worktree's stack isn't up — bring it up the same way the original `crew run` did, then re-run smoke.

Treat smoke failure the same as test failure: do not push.
