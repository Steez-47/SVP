// Local release build. Signs updater artifacts with ~/.tauri/svp.key when present (CI uses repo secrets).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const key = join(homedir(), ".tauri", "svp.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(key)) { env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(key, "utf8"); env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ""; }
if (!env.TAURI_SIGNING_PRIVATE_KEY) console.warn("No signing key: updater artifacts will fail to sign. Run `npx tauri signer generate -w ~/.tauri/svp.key`.");
// tauri-action appends "build" to tauriScript; npm run build omits it.
const args = process.argv.slice(2);
if (args[0] === "build") args.shift();
const r = spawnSync(process.execPath, [join("node_modules", "@tauri-apps", "cli", "tauri.js"), "build", ...args], { stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);
if (process.platform === "win32") {
  const option = (flag) => args.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1)
    ?? (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const scanArgs = ["-NoProfile", "-File", "scripts/scan-release.ps1", "-Profile", option("--profile") ?? (args.includes("--debug") ? "debug" : "release")];
  const target = option("--target") ?? env.CARGO_BUILD_TARGET;
  if (target) scanArgs.push("-Target", target);
  if (!args.includes("--no-bundle")) scanArgs.push("-IncludeInstaller");
  const scan = spawnSync("powershell.exe", scanArgs, { stdio: "inherit", env });
  process.exit(scan.status ?? 1);
}
