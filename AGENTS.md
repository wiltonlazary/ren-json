# ren-json

Read the workspace layer first: `../../../AGENTS.md` and
`../../../.ai/config/` (stability.md first). Then [README.md](README.md).

ren-json is a server-side render of ren-core views (no hydration). It consumes only
public entries (`ren-core`). Its exports are locked by
`test/exports.lock.json`; it changes only for a defect, or when the user
asks. Install rrx-core, ren-core first.
