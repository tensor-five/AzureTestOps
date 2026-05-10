# Contributing

Thank you for helping improve this project. This repository is a small local open-source tool for working with Azure DevOps data, so contributions should stay focused, practical, and easy to review.

## Before You Start

- Open an issue or discussion before larger behavior changes.
- Keep pull requests small and limited to one concern.
- Do not commit secrets, personal Azure DevOps data, tokens, logs, or local configuration.
- Prefer existing project patterns over new abstractions or dependencies.

## Development

Install dependencies and run the relevant checks before opening a pull request:

```bash
npm install
npm run typecheck
npm run check:cycles
npm test
```

For small documentation-only changes, tests are usually not required. For code changes, run the affected tests at minimum and include the commands in the pull request.

## Project Conventions

- Keep UI changes aligned with the existing token system and local shell styles.
- Persist user preferences through the existing lowdb-backed preference flow; use localStorage only as a compatibility fallback.
- Keep feature logic in focused modules, hooks, adapters, or services instead of growing orchestration components.
- Add or update tests for non-trivial behavior changes.
- Avoid new package dependencies unless the existing codebase cannot reasonably solve the problem.

## Pull Requests

Please include:

- A short description of the problem and solution.
- Screenshots or recordings for visible UI changes.
- Notes about any Azure DevOps API behavior that changed.
- The checks you ran, or a short reason why they were skipped.

## Trademark Notice

Azure and Azure DevOps are trademarks of Microsoft Corporation. This project is independent and is not affiliated with, endorsed by, or sponsored by Microsoft.
