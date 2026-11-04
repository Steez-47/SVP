// Dev harness: drive the running SVP webview over CDP (WebView2 remote debugging).
// Start SVP with env WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
//   node scripts/cdp.mjs eval "<js expression>"     → prints JSON result (awaits promises)
//   node scripts/cdp.mjs shot out.png [w h]          → screenshot of the page
//   node scripts/cdp.mjs key "Period" [n] [delayMs]  → dispatch real key presses
import { writeFileSync } from "node:fs";
const port = process.env.CDP_PORT || 9333;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
if (!page) { console.error("no page target"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const [cmd, ...args] = process.argv.slice(2);
if (cmd === "evalfile") { args[0] = (await import("node:fs")).readFileSync(args[0], "utf8"); }
if (cmd === "eval" || cmd === "evalfile") {
  const r = await send("Runtime.evaluate", { expression: args[0], awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r, null, 1));
} else if (cmd === "shot") {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(args[0], Buffer.from(r.result.data, "base64")); console.log("saved", args[0]);
} else if (cmd === "key") {
  const code = args[0], n = +(args[1] || 1), delay = +(args[2] || 0);
  const key = { Period: ".", Comma: ",", Space: " " }[code] || code.replace(/^Key/, "").toLowerCase();
  for (let k = 0; k < n; k++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", code, key, text: key.length === 1 ? key : undefined });
    await send("Input.dispatchKeyEvent", { type: "keyUp", code, key });
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  console.log("sent", n, code);
}
ws.close();
