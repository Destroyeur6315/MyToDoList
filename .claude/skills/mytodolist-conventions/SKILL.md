---
name: mytodolist-conventions
description: Project conventions for MyToDoList (Node.js 24, Express 5, node:sqlite, vanilla ES modules, Tailwind v4). Use before writing, editing, reviewing or testing any code, test, workflow or documentation in this repository, and before ending any response that modified files (commit message rule).
---

# MyToDoList conventions

Apply every rule below whenever you touch this repository. When a rule conflicts with an explicit request from the user, follow the user and say so.

## 1. Language

| What | Language |
|---|---|
| Code: identifiers, file names, branch names | English |
| Code comments and JSDoc | English |
| Test names and assertion messages | English |
| Commit messages and PR descriptions | English |
| New server log messages (`console.*`) | English |
| Text shown to end users: UI labels, toasts, API `{ error }` messages | **French** |
| Replies to the user in the chat | French |

Never mix languages inside code. If you touch a line that has a French comment or identifier, translate it to English.

## 2. Tests: mandatory for every code change

Any new feature or bug fix that changes code under `src/`, `public/js/` or `server.js` ships with tests in the same change. Pure documentation, styling or CI changes do not need tests.

- **Runner**: Node's built-in `node:test` with `node:assert/strict`. No Jest, Mocha or other test framework. The only DOM library is `jsdom` (dev dependency), used for UI tests; do not add another one (no happy-dom, Testing Library or Playwright in `npm test`).
- **Location**: `tests/<area>.test.js`. `npm test` (`node --test`) runs every `*.test.js` file automatically. Never list test files by name in scripts or CI.
- **Minimum coverage per change**:
  - New or changed validation or domain function → unit tests covering a valid input, each rejection branch and edge values (see `tests/validation.test.js`).
  - New or changed API route → integration test in `tests/api.test.js` style: temporary SQLite database, real HTTP calls, success case, 4xx cases (bad input, missing auth, other user's data).
  - Bug fix → a regression test that fails without the fix.
  - Front-end logic → extract it as a pure function (no DOM access) in a module without DOM imports (see `public/js/tabs.js`), and unit test it by importing the ES module from a CommonJS test (`await import('../public/js/<module>.js')`, see `tests/tabs.test.js`).
  - Front-end interactions (clicks, dialogs, rendering, what gets saved) → UI test in `tests/ui.test.js` style: the real `public/index.html` in jsdom, the real modules imported from `public/js/main.js`, and a real API server on a temporary SQLite database. Drive the page like a user (`.click()`, `change` events), then assert on the DOM **and** on `GET /api/state`. Reuse that file's harness: browser globals, tracked timers cleared in `after()` so the process exits, `settle()` to wait for pending saves, and the `afterEach` check that the page threw no error. Prefer pure functions for logic; use UI tests for the wiring, not instead of unit tests.
- **Coverage**: `npm run test:coverage` measures `src/` and `public/js/` and writes `coverage/lcov.info`. SonarQube Cloud reads that report and fails the quality gate below **80 % coverage on new code**: check the coverage of the files you changed before finishing.
- **Style**: CommonJS, `'use strict'`, a short JSDoc header describing the file, test names that state the expected behaviour (`'normalizeTask rejects out-of-range values'`).
- **Before finishing**: run `npm test` and report the pass/fail count. Never claim tests pass without running them.

## 3. Architecture

- **Server** (`src/`, `server.js`): CommonJS with `'use strict'`. No new framework.
  - Environment variables are read **only** in `src/config.js`.
  - Input validation and normalization live in `src/domain/validation.js`.
  - SQL lives only in `src/db/repositories/`, and every query is parameterized: never build SQL with string concatenation or template literals.
  - HTTP errors use `HttpError` / `ValidationError` from `src/http/errors.js`, with French messages.
  - `server.js` calls `start()` unconditionally. Hostinger loads it through its own launcher, so never add a `require.main === module` guard.
- **Front-end** (`public/js/`): native ES modules, no framework, no bundler.
  - Any user-provided value inserted with `innerHTML` goes through `escapeHtml()` from `public/js/utils.js`.
  - Every mutating API call goes through `public/js/api.js`, which adds the `X-MyToDoList-Request: 1` header.
  - Click handling uses the `data-action` delegation in `public/js/actions.js`. Do not add inline `onclick` handlers.
- **Styles**: Tailwind classes in the HTML, custom CSS in `styles/main.css`. Never edit `public/css/main.css` by hand: regenerate it with `npm run build:css` and include it in the change. If the `tailwindcss` binary is not executable, run `node node_modules/@tailwindcss/cli/dist/index.mjs -i styles/main.css -o public/css/main.css --minify`.
- **Themes**: every UI change must work in both light and dark themes. Use the color tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`…), never hard-coded colors.

## 4. Security

- Strict CSP: no inline `<script>`, no `eval` / `new Function`, no resource loaded from a CDN or third-party service (fonts and scripts are self-hosted).
- CSRF protection is `requireSameOrigin` in `src/http/middleware.js`. Keep it on every `/api` route.
- Every query on user data is filtered by the session user's id.
- Never commit secrets, `.env` files or SQLite databases.
- Semgrep (`p/default`) blocks the CI on any finding. Suppress a rule with `// nosemgrep: <rule-id>` only for a confirmed false positive, with a comment that explains why.

## 5. CI and dependencies

- GitHub Actions are pinned to a full 40-character commit SHA followed by a `# vX.Y.Z` comment. Never use a mutable tag such as `@v4`. Resolve a SHA with `git ls-remote --tags https://github.com/<owner>/<repo>.git`.
- Tool versions installed in workflows are pinned (for example `pip install semgrep==1.186.0`).
- Dependabot (`.github/dependabot.yml`) handles action and npm updates. Do not bump versions by hand unless asked. Every `updates` entry keeps a `cooldown` block (`default-days: 7`): Semgrep blocks the CI without it.

## 6. Documentation

Update `README.md` in the same change when behaviour, configuration (environment variables), scripts, the API or the project structure changes.

## 7. Git

- Never commit, push or create branches unless the user asks.
- Never push directly to `main`: every push to `main` triggers an automatic production deployment on Hostinger.
- Commit format, in English and imperative mood:

  ```text
  <gitmoji> <type>(<scope>): <short description>
  ```

  | Gitmoji | Type | Use |
  |---|---|---|
  | `:sparkles:` | `feat` | New feature |
  | `:bug:` | `fix` | Bug fix |
  | `:lock:` | `fix` | Security fix |
  | `:white_check_mark:` | `test` | Tests only |
  | `:recycle:` | `refactor` | Restructuring without behaviour change |
  | `:lipstick:` | `style` | UI and styles |
  | `:memo:` | `docs` | Documentation |
  | `:construction_worker:` | `ci` | CI workflows |
  | `:arrow_up:` | `chore` | Dependency upgrades |
  | `:wrench:` | `chore` | Configuration and tooling |

  Common scopes: `server`, `api`, `auth`, `db`, `ui`, `security`, `ci`, `deps`, `readme`.

## 8. End of every response that modified files

If the response created, modified or deleted **at least one file**, end it with a `Commit` section. List only the files changed during the session that are not committed yet (check with `git status --short`):

````markdown
### Commit

```bash
git add <file 1> <file 2> …
git commit -m "<gitmoji> <type>(<scope>): <short description>" -m "<optional body: why, in one or two sentences>"
```
````

If the changes cover unrelated topics, propose one commit per topic. If no file was modified, do not add this section.
