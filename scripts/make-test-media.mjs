// Generates sample videos in test-media/ (gitignored) for exercising the player.
// Usage: node scripts/make-test-media.mjs [--force]
// Clips that already exist are skipped unless --force is passed. A clip whose
// encoder fails is skipped with a warning and does not abort the run.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-media");
const force = process.argv.includes("--force");

const KEEP = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024 };

const SINE_440 = "sine=frequency=440:sample_rate=48000";

// A standard clip: testsrc2 video + 440 Hz sine audio, both trimmed to `dur`.
function clip({ w, h, rate, dur = 10, video, audio, pixFmt }) {
  const args = [
    "-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=${rate}`,
    "-f", "lavfi", "-i", SINE_440,
    "-t", String(dur),
  ];
  if (pixFmt) args.push("-pix_fmt", pixFmt);
  args.push("-ac", "2", ...video, ...audio);
  return args;
}

const x265 = (params = []) => ["-c:v", "libx265", "-x265-params", "log-level=error", ...params];
const av1 = ["-c:v", "libsvtav1", "-preset", "8", "-crf", "40"];
const aac = (br = "160k") => ["-c:a", "aac", "-b:a", br];
const opus = ["-c:a", "libopus", "-b:a", "128k"];
const pcm = ["-c:a", "pcm_s16le"];

const srtPath = join(mkdtempSync(join(tmpdir(), "svp-subs-")), "cues.srt");
const SRTS = `1
00:00:00,500 --> 00:00:02,500
First cue — the quick brown fox

2
00:00:03,000 --> 00:00:05,500
Second cue — jumps over the lazy dog

3
00:00:06,000 --> 00:00:09,500
Third cue — 0123456789
`;

function multiAudioSubs() {
  return [
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
    "-f", "lavfi", "-i", SINE_440,
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
    "-i", srtPath,
    "-t", "10",
    "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0", "-map", "3:s:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-ac:a:0", "2", "-ac:a:1", "2",
    "-c:s", "srt",
    "-metadata:s:a:0", "language=eng",
    "-metadata:s:a:1", "language=jpn",
    "-metadata:s:s:0", "language=eng",
  ];
}

const clips = [
  {
    name: "h264_aac.mp4",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
      audio: aac(),
    }),
  },
  {
    name: "hevc_aac.mp4",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p",
      video: [...x265(["-preset", "fast", "-crf", "28"]), "-tag:v", "hvc1"],
      audio: aac(),
    }),
  },
  {
    name: "hevc10_opus.mkv",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p10le",
      video: x265(["-preset", "fast", "-crf", "28"]),
      audio: opus,
    }),
  },
  {
    name: "av1_opus.webm",
    args: clip({ w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p", video: av1, audio: opus }),
  },
  {
    name: "av1_aac.mp4",
    args: clip({ w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p", video: av1, audio: aac() }),
  },
  {
    name: "vp9_opus.webm",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "0", "-crf", "40"],
      audio: opus,
    }),
  },
  {
    name: "prores_pcm.mov",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv422p10le",
      video: ["-c:v", "prores_ks", "-profile:v", "2"],
      audio: pcm,
    }),
  },
  {
    name: "mpeg2_ac3.ts",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "mpeg2video", "-q:v", "4"],
      audio: ["-c:a", "ac3", "-b:a", "192k"],
    }),
  },
  {
    name: "h264_dts.mkv",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
      audio: ["-c:a", "dca", "-strict", "-2"],
    }),
  },
  {
    name: "mpeg4_mp3.avi",
    args: clip({
      w: 1280, h: 720, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "mpeg4", "-q:v", "4"],
      audio: ["-c:a", "libmp3lame", "-b:a", "192k"],
    }),
  },
  {
    name: "wmv2_wmav2.wmv",
    args: clip({
      w: 1280, h: 720, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "wmv2", "-q:v", "4"],
      audio: ["-c:a", "wmav2", "-b:a", "192k"],
    }),
  },
  {
    name: "dnxhr_pcm.mov",
    args: clip({
      w: 1920, h: 1080, rate: 30, pixFmt: "yuv422p",
      video: ["-c:v", "dnxhd", "-profile:v", "dnxhr_sq"],
      audio: pcm,
    }),
  },
  { name: "multi_audio_subs.mkv", args: multiAudioSubs() },
  {
    name: "hevc10_4k60.mp4",
    args: clip({
      w: 3840, h: 2160, rate: 60, dur: 5, pixFmt: "yuv420p10le",
      video: [...x265(["-preset", "ultrafast", "-crf", "30"]), "-tag:v", "hvc1"],
      audio: aac(),
    }),
  },
  {
    name: "vertical_h264.mp4",
    args: clip({
      w: 1080, h: 1920, rate: 30, pixFmt: "yuv420p",
      video: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
      audio: aac(),
    }),
  },
  {
    name: "longgop_h264_60.mp4",
    args: clip({
      w: 1920, h: 1080, rate: 60, dur: 20, pixFmt: "yuv420p",
      video: [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-g", "300", "-keyint_min", "300", "-sc_threshold", "0",
      ],
      audio: aac(),
    }),
  },
  {
    name: "sample_60s.mp4",
    args: clip({
      w: 1920, h: 1080, rate: 30, dur: 60, pixFmt: "yuv420p",
      video: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"],
      audio: aac("192k"),
    }),
  },
];

function ffmpeg(args) {
  return spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args], KEEP);
}

function ffprobeSummary(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", file],
    KEEP,
  );
  if (r.status !== 0) return "probe failed";
  let streams = [];
  try {
    streams = JSON.parse(r.stdout).streams ?? [];
  } catch {
    return "probe failed";
  }
  const pick = (type) => streams.filter((s) => s.codec_type === type).map((s) => s.codec_name);
  return [pick("video"), pick("audio"), pick("subtitle")]
    .filter((list) => list.length)
    .map((list) => list.join("+"))
    .join(" / ");
}

function mb(file) {
  return (statSync(file).size / (1024 * 1024)).toFixed(2);
}

function main() {
  const probe = spawnSync("ffmpeg", ["-version"], KEEP);
  if (probe.error || probe.status !== 0) {
    console.error("ffmpeg was not found on PATH.");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(srtPath, SRTS, "utf8");

  const rows = [];
  const failed = [];
  const started = Date.now();

  for (const { name, args } of clips) {
    const out = join(outDir, name);
    if (existsSync(out) && !force) {
      console.log(`skip  ${name} (already exists)`);
      rows.push({ name, size: mb(out), codecs: ffprobeSummary(out) });
      continue;
    }
    const t0 = Date.now();
    const r = ffmpeg([...args, out]);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.status !== 0) {
      const detail = (r.stderr || String(r.error || "")).trim().split(/\r?\n/).slice(-12).join("\n");
      console.warn(`FAIL  ${name} — skipped after ${secs}s\n${detail}`);
      rmSync(out, { force: true });
      failed.push(name);
      continue;
    }
    console.log(`ok    ${name} (${secs}s)`);
    rows.push({ name, size: mb(out), codecs: ffprobeSummary(out) });
  }

  rmSync(dirname(srtPath), { recursive: true, force: true });

  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const sizeW = Math.max(7, ...rows.map((r) => r.size.length));
  console.log("");
  console.log(`${"name".padEnd(nameW)}  ${"size MB".padStart(sizeW)}  codecs`);
  console.log(`${"-".repeat(nameW)}  ${"-".repeat(sizeW)}  ${"-".repeat(40)}`);
  for (const r of rows) {
    console.log(`${r.name.padEnd(nameW)}  ${r.size.padStart(sizeW)}  ${r.codecs}`);
  }
  console.log("");
  console.log(`${rows.length}/${clips.length} clips in ${outDir} — ${((Date.now() - started) / 1000).toFixed(1)}s total`);

  if (failed.length) {
    console.warn(`failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main();
