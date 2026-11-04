// Copies the Steez kit (source of truth: /steez) into ui/steez so Tauri can embed it.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "ui", "steez"), { recursive: true, force: true });
for (const d of ["css", "js"]) cpSync(join(root, "steez", d), join(root, "ui", "steez", d), { recursive: true });
console.log("steez kit synced → ui/steez");
