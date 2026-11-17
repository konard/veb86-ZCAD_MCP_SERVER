# Issue #1 work plan

Objective: implement and verify all requirements in issue #1 in PR #2, without
changing ZCAD or its SDK. Keep genuinely blocked acceptance criteria unfinished.

## Plan and requirement inventory

- [x] Read the complete issue, comments, sub-issues and all three PR feedback types
  (none present on 2026-11-17); inspect repository guidance and recent related work.
- [x] Analyze the actual HTTP handlers at a pinned upstream revision; document
  usable routes, command registration, execution, results and limitations (§4).
- [x] Build an independent TypeScript app using the official SDK as dependencies,
  with extensible tool registration and lifecycle management (§2, §3.1–3.2).
- [x] Implement a transport-only HTTP adapter: configurable target and headers,
  parameter encoding, response conversion, connection/status/format errors,
  deadlines, bounded large/chunked responses and cancellation (§3.3, §6).
- [x] Configure ZCAD address/port, connection options, timeouts and MCP transport
  externally, with validation and no recompilation (§5).
- [x] Expose existing HTTP capabilities without implementing CAD operations or
  inventing unsupported ZCAD routes (§3.2, §6).
- [x] Supply a separate HTTPServer change specification for approval covering
  problems, architecture, routes/formats, execution/results, queues, concurrency,
  deadlines, errors, affected modules and acceptance (§4). Make no upstream edits.
- [x] Add focused automated SDK-client → MCP → adapter → HTTP fixture tests,
  including connection, timeout, malformed-response and lifecycle failures (§7).
- [x] Provide and attempt the live-ZCAD smoke scenario; preserve failure evidence.
- [ ] Verify a successful round trip against real ZCAD (§7.5). No runtime or
  endpoint is available; the attempt returned CONNECTION_ERROR. A fixture alone
  does not verify this criterion.
- [x] Write installation, configuration, startup, client and extension docs (§8).
- [x] Run focused checks, review the entire PR diff, commit atomic steps, push
  only the prepared branch, synchronize upstream main and update PR #2.
- [x] Check current-head CI (preserve and inspect failure logs if any), refresh
  feedback, mark PR ready when implementation is finished, keep it unmerged.

## Verification strategy

Use Node's test runner with finite local HTTP fixtures and the official SDK
client, sequentially and with short test deadlines. Typecheck/build the small
TypeScript app once code and tests are drafted. No ZCAD build or stress tests.
Record commands, results and any blocked criterion here and in the PR.

## Current verification

`npm run verify`: build and 27 tests passed (Node 26.13.0, ~6 seconds).
`npm run smoke`: exited 1; SDK connection/discovery succeeded, GET /ipc failed
with CONNECTION_ERROR. No ZCAD runtime/endpoint is available. Live criterion
§7.5 remains unfinished. See [requirement/evidence map](docs/verification.md).

Upstream spec is submitted for approval as part of PR #2; implementing that
separate work is explicitly not authorized by issue #1 before approval.

Final review: all issue comments, sub-issues, PR conversation/inline comments
and reviews are empty. The PR diff preserves the original repository's scope;
there were no existing application features. Upstream main is an ancestor of
this branch. No Actions runs or PR checks exist, so no CI pass is claimed.
PR #2 now has its final title, implementation/test/blocked-criterion description,
and positive `Closes #1` reference; it is ready for review and remains unmerged.
