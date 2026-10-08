// Lets plain Node (>=22.18, built-in TypeScript stripping) run our dependency-free lib/*.ts files in tests:
// resolves extensionless relative imports and the "@/" alias to .ts files.
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
