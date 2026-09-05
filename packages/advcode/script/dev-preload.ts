// Dev shim preload: register the Solid JSX transform before any TUI module loads.
// `bun run src/index.ts` runs raw source with no build step, so bun's default
// (react) JSX transform would hijack every .tsx file. The canonical build
// (script/build.ts) passes createSolidTransformPlugin() to Bun.build; this
// preload does the same for the runtime path.
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"

ensureSolidTransformPlugin()