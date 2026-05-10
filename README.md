# Azure TestOps

Local-first Azure DevOps tool to map **Test Cases** (with Test Suite hierarchy and run/result outcome aggregation) against **Bugs / Work Items** (driven by a Saved Query) and edit `Related` links between them visually.

## License

This project is licensed under the Azure TestOps Attribution License. It is
MIT-like, but requires visible attribution to TensorFive GmbH. See
[`LICENSE`](./LICENSE).

## Contributing and Security

- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Code of Conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- Security policy and private vulnerability reporting: [`SECURITY.md`](./SECURITY.md)
- Notices and trademark context: [`NOTICE.md`](./NOTICE.md)

## What it does

- Loads a configurable **Set** = `(Test Plan + root Test Suite + Saved Query)`
- Joins Test Cases to their latest Test Result outcome per `(WorkItemID, SuiteID)` (so filters like "hide passed" actually work)
- Renders Test Cases (left, grouped by Suite hierarchy) and Bugs/Work Items (right, from the query) in two columns
- Two interaction modes:
  - **Edit Relations**: draw a line between Test Case ↔ Bug → writes a `System.LinkTypes.Related` link to Azure DevOps
  - **Move Items**: rearrange items per Set (snap-to-grid, persisted in lowdb)
- Filters per column (last outcome, full-text title search, state/assigned-to/tags/work-item-type)
- Switch between Sets via header dropdown
- Light + dark theme

## Prerequisites

- Node.js 22+ and npm
- Azure CLI (`az`)
- Azure DevOps Azure CLI extension (`azure-devops`)
- Authenticated Azure CLI session (`az login`)

```bash
az extension add --name azure-devops
```

## Quick start

```bash
npm install
npm run dev:local
```

The local server listens on `http://127.0.0.1:8081` by default (chosen so it can run alongside AzureGanttOps on 8080).

## One-click local start (Mac + Windows)

- macOS: `Start Azure TestOps.command` (double-click)
- Windows: `Start Azure TestOps.cmd` (double-click)

What the launcher does:
- checks `node` and `az`
- installs `azure-devops` CLI extension if missing
- runs `npm install` once when `node_modules` is missing
- runs `npm run build` if build artifacts are missing
- starts the app server and opens the browser

CLI alternative:

```bash
npm run app:start
```

## Configuration

Copy values from `.env.example` into your environment as needed. Key variables:

- `PORT`: local HTTP port (default 8081)
- `ADO_PAT` / `AZURE_DEVOPS_EXT_PAT`: optional PAT auth (otherwise Azure CLI token flow)
- `ADO_VERBOSE_LOGS`: verbose runtime logs (`1` or `0`)
- `ADO_WRITE_ENABLED`: enables relation write-back (`1` or `0`)

## Local data

- Sets, layout positions, filters, preferences and Azure DevOps context:
  `~/.azure-testops/user-preferences.json`

## Privacy and data handling

- The app stores user-specific settings locally under `~/.azure-testops/`.
- Azure DevOps data access is performed from the local backend process using your local auth context.
- Secrets and tokens should be supplied through the Azure CLI session or environment variables, never committed to the repository.

## Architecture

Hexagonal (Ports & Adapters) + Clean Architecture + tactical DDD, using the same local-first architecture and visual design language as Azure GanttOps. See [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md) for the binding architecture rules.

## Trademark Notice

Azure and Azure DevOps are trademarks of Microsoft. This project is an independent open source project and is not affiliated with, endorsed by, or sponsored by Microsoft.
