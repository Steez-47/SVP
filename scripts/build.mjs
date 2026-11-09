// Local release build (Windows: NSIS installer + Defender scan; Linux: AppImage, .deb, .rpm).
// Signs updater artifacts with ~/.tauri/svp.key when present (CI uses repo secrets).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const key = join(homedir(), ".tauri", "svp.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(key)) { env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(key, "utf8"); env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ""; }
// tauri-action appends "build" to tauriScript; npm run build omits it.
const args = process.argv.slice(2);
if (args[0] === "build") args.shift();
if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  console.warn("No signing key (~/.tauri/svp.key): building installers without updater artifacts. CI signs releases.");
  const sep = args.indexOf("--"); // anything after "--" goes to cargo
  args.splice(sep < 0 ? args.length : sep, 0, "--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
}
// AppImage: linuxdeploy's GStreamer plugin only guesses Debian/Ubuntu paths; point it at Fedora's lib64 layout.
if (process.platform === "linux" && !env.GSTREAMER_PLUGINS_DIR && existsSync("/usr/lib64/gstreamer-1.0")) {
  env.GSTREAMER_PLUGINS_DIR = "/usr/lib64/gstreamer-1.0";
  env.GSTREAMER_HELPERS_DIR ??= "/usr/libexec/gstreamer-1.0";
}
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
