# Issue #1 work plan

Objective: implement and verify all requirements in issue #1 in PR #2, without
changing ZCAD or its SDK. Keep genuinely blocked acceptance criteria unfinished.

## Plan and requirement inventory

- [x] Read the complete issue, comments, sub-issues and all three PR feedback types
  (none present on 2026-11-17); inspect repository guidance and recent related work.
- [ ] Analyze the actual HTTP handlers at a pinned upstream revision; document
  usable routes, command registration, execution, results and limitations (§4).
- [ ] Build an independent TypeScript app using the official SDK as dependencies,
  with extensible tool registration and lifecycle management (§2, §3.1–3.2).
- [ ] Implement a transport-only HTTP adapter: configurable target and headers,
  parameter encoding, response conversion, connection/status/format errors,
  deadlines, bounded large/chunked responses and cancellation (§3.3, §6).
- [ ] Configure ZCAD address/port, connection options, timeouts and MCP transport
  externally, with validation and no recompilation (§5).
- [ ] Expose existing HTTP capabilities without implementing CAD operations or
  inventing unsupported ZCAD routes (§3.2, §6).
- [ ] Supply a separate HTTPServer change specification for approval covering
  problems, architecture, routes/formats, execution/results, queues, concurrency,
  deadlines, errors, affected modules and acceptance (§4). Make no upstream edits.
- [ ] Add focused automated SDK-client → MCP → adapter → HTTP fixture tests,
  including connection, timeout, malformed-response and lifecycle failures (§7).
- [ ] Provide a live-ZCAD smoke scenario; execute when an existing ZCAD endpoint
  is available. A fixture alone does not verify the real ZCAD criterion (§7.5).
- [ ] Write installation, configuration, startup, client and extension docs (§8).
- [ ] Run focused checks, review the entire PR diff, commit atomic steps, push
  only the prepared branch, synchronize upstream main and update PR #2.
- [ ] Check current-head CI (preserve and inspect failure logs if any), refresh
  feedback, mark PR ready when implementation is finished, keep it unmerged.

## Verification strategy

Use Node's test runner with finite local HTTP fixtures and the official SDK
client, sequentially and with short test deadlines. Typecheck/build the small
TypeScript app once code and tests are drafted. No ZCAD build or stress tests.
Record commands, results and any blocked criterion here and in the PR.
