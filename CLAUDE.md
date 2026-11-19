# MyToDoList

Before writing, editing or reviewing anything in this repository, load the `mytodolist-conventions` skill (`.claude/skills/mytodolist-conventions/SKILL.md`) and follow it.

Non-negotiable rules, even if the skill is not loaded:

- Code, identifiers, comments, tests and commit messages are in **English**. Text shown to end users stays in **French**. Reply to the user in French.
- Every change to code under `src/`, `public/js/` or `server.js` comes with tests (`node:test`, in `tests/`). Run `npm test` before finishing.
- Never commit or push unless asked. Never push to `main` (it deploys to production).
- When a response modifies at least one file, end it with a `Commit` section: the `git add` command for the changed files and a commit message in the format `<gitmoji> <type>(<scope>): <description>`.
