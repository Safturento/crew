
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. The worktree's API runs at **{{baseUrl}}**, and crew has generated `{{collectionDir}}/environments/{{envName}}.bru` with `baseUrl`{{testUserClause}} for you. The environment is exported as `CREW_BRUNO_ENV={{envName}}` in your spawn env.

Two non-negotiable rules whenever this project's API is involved:

1. **Run the smoke flow as part of verification.** Before claiming "Verify" complete, run `npm run bruno:smoke` (the project's script reads `CREW_BRUNO_ENV` automatically). A non-zero exit means smoke failed — verification is **not** complete; loop back to step 7 (Execute).
2. **Update `.bru` files when endpoints change.** If you add, remove, or modify any HTTP endpoint, the same PR must add or update the matching `{{collectionDir}}/endpoints/<route-group>/<verb>-<name>[-<case>].bru` and `{{collectionDir}}/flows/<flow>.bru` files. Coverage drifts the moment a route changes without its `.bru`.

The `bruno-collection-maintenance` skill (auto-discovered) covers naming conventions, the `vars:post-response` patterns, and the conventions for `flows/` vs `endpoints/`.
