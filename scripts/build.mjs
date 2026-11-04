// Local release build. Signs updater artifacts with ~/.tauri/svp.key when present (CI uses repo secrets).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const key = join(homedir(), ".tauri", "svp.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(key)) { env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(key, "utf8"); env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ""; }
if (!env.TAURI_SIGNING_PRIVATE_KEY) console.warn("No signing key: updater artifacts will fail to sign. Run `npx tauri signer generate -w ~/.tauri/svp.key`.");
const r = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
