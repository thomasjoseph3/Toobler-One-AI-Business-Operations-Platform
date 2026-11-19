# Claude memory notes (copy for another machine)

`claude-memory/` is a copy of Claude Code's own memory notes for this project, taken on 18 Nov 2026. They hold the owner's working preferences, decisions that are not
anywhere else, and a short note for each feature (what was built, where, how to try it). They contain no secrets.

**Why they are here:** Claude Code keeps its memory outside the repository (in your home folder), so a fresh clone on another machine starts without them.

**To restore them on a new machine:**
1. Install Claude Code, sign in, and open it once inside the cloned project folder. It creates its memory folder for that project.
   - Linux/Mac: `~/.claude/projects/<project path with dashes>/memory/`
   - Windows: `%USERPROFILE%\.claude\projects\<project path with dashes>\memory\`
2. Copy every file from `claude-memory/` into that folder (keep `MEMORY.md`, it is the index).
3. Start a new Claude Code session and say "continue".

If you skip this, nothing breaks: `docs/HANDOVER.md` has the essentials. These files are a snapshot; the live ones on the original machine may be newer.
