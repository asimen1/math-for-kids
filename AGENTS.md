# AGENTS.md

Shower Math (חשבון במקלחת) is a Hebrew math-practice PWA for Android. It's static HTML/CSS/JS with no build step, deployed to GitHub Pages from `main`. See README.md for features, running and deploying.

## Commands

- `npm test`: unit tests (`node --test`). Run them before every commit.
- `npm start`: serve locally at http://localhost:8080.

## Versioning

- The version shown in the app (under the Start button) is read from `package.json` at runtime.
- **Every commit must change the version.** The pre-commit hook in `.githooks/` bumps the patch number automatically. Enable it once per clone with `git config core.hooksPath .githooks`.
- For a notable release, bump the minor or major version yourself (e.g. `0.1.7` → `0.2.0`) and stage it; the hook then leaves it alone.
- Don't commit with `--no-verify`. That skips the bump.

## Conventions

- All user-facing text is Hebrew. Keep math expressions left-to-right inside the RTL page (`dir="ltr"`).
- When you add a file under `js/`, also add it to `SHELL` in `sw.js` and bump `CACHE` there.
- Commit or push only when asked.
