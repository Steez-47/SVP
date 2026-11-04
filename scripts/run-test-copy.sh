#!/bin/sh
# Dev helper: sync ui/ + backend into an isolated copy (~/.t3/svp-run), rebuild, relaunch with CDP on :9333.
# Keeps runtime testing stable while other agents edit src-tauri. Usage: sh scripts/run-test-copy.sh [--keep-trim-stub]
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"; R="$REPO/../../svp-run"
taskkill //IM svp.exe //F >/dev/null 2>&1 || true
node "$REPO/scripts/sync-steez.mjs" >/dev/null
rm -rf "$R/ui"; cp -r "$REPO/ui" "$R/ui"
cp "$REPO/src-tauri/Cargo.toml" "$REPO/src-tauri/Cargo.lock" "$R/src-tauri/"; cp -r "$REPO/src-tauri/capabilities" "$REPO/src-tauri/windows" "$R/src-tauri/"
node -e "const f=process.argv[1],c=JSON.parse(require('fs').readFileSync(f+'/src-tauri/tauri.conf.json','utf8'));delete c.build.beforeDevCommand;delete c.build.beforeBuildCommand;require('fs').writeFileSync(process.argv[2]+'/src-tauri/tauri.conf.json',JSON.stringify(c,null,2))" "$REPO" "$R"
for f in "$REPO"/src-tauri/src/*.rs; do b=$(basename "$f"); [ "$b" = trim.rs ] || cp "$f" "$R/src-tauri/src/$b"; done
[ "$1" = "--keep-trim-stub" ] || cp "$REPO/src-tauri/src/trim.rs" "$R/src-tauri/src/trim.rs"
cd "$R/src-tauri" && CARGO_TARGET_DIR="$R/target" cargo build --features tauri/custom-protocol 2>&1 | grep -E "^error|Finished" || true
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" "$R/target/debug/svp.exe" > "$R/run.log" 2>&1 &
for i in $(seq 1 40); do curl -s http://127.0.0.1:9333/json >/dev/null 2>&1 && break; sleep 0.5; done
sleep 1; echo "SVP test copy running"
