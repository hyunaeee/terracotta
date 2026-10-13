# Approval and identity validation

Run `npm run test:behavior` with Node.js 24. `npm test` also builds the Worker and runs the existing source/runtime checks. After a build, `npm run typecheck` generates the matching Cloudflare runtime types and checks TypeScript. GitHub Actions runs lint, the full suite, and type checking on pull requests; image publishing depends on the validation job and runs only for main or version tags.

The behavioral suite imports the production API handlers, orchestrator, and MCP client. It executes the production SQL against SQLite through a small adapter matching D1's asynchronous query/result interface. Provider and MCP responses are deterministic fixtures; no live API credentials or external writes are used.

Verified cases:

- 20 concurrent submissions of one approval: one successful response, 19 conflicts, one external write attempt.
- Direct tool API: unapproved write returns 403; a read still succeeds.
- Expired, foreign-owner, and mismatched-token approvals cannot call the model or tool.
- Rejected approvals cannot be replayed as approvals.
- A new approval batch in the same run has a new token; the old card cannot authorize it.
- A model failure after a write leaves the approval closed; retry does not repeat the write.
- The MCP execution boundary compares the claimed owner, token, call ID, tool, and arguments.
- Single-user self-hosting ignores identity headers; trusted-proxy mode requires an identity.

Limits: this is not a deployed Cloudflare/D1 concurrency or load benchmark. It does not establish an end-to-end exactly-once guarantee with external services. A process crash after the claim may leave an unresolved run; automatic replay is intentionally disabled. Tool risk metadata remains a trust assumption for connected MCP servers. User/organization credit reservations, atomic settlement, and payment webhooks are separate work and are not implemented by this change.
