# sa-agent-desktop

SA-Agent Desktop Client scaffolded as an Electron + React + TypeScript + Vite workspace.

## Requirements

- Node.js 22+
- npm 11+

## Scripts

- `npm run dev` starts the Vite renderer and launches Electron against it
- `npm run typecheck` runs renderer and Electron TypeScript checks
- `npm run build` builds the renderer into `dist/` and the Electron process into `dist-electron/`
- `npm run test:e2e` runs the Playwright Electron smoke test
- `npm test` aliases `npm run test:e2e`

## First-run UI

The current shell intentionally boots into a minimal language selection surface with:

- `Русский`
- `English`

The selection is stored in `localStorage` so the renderer has a minimal first-run state to build on.

## Notes

- Electron security baseline is set to `contextIsolation: true` and `nodeIntegration: false`.
- The Playwright smoke test launches Electron directly and verifies that both language options are visible.

---

Part of the [SA-Agent](https://github.com/AstAgency/astagency-docs) product ecosystem.
