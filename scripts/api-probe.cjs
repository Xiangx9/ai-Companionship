const fs = require("fs");
const path = require("path");
const https = require("https");
const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter(Boolean).map((line) => {
  const i = line.indexOf("=");
  return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
}));
const base = (env.VITE_API_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/$/, "");
const key = env.VITE_API_KEY || "";
const url = new URL(base + "/chat/completions");
const body = JSON.stringify({
  model: "agnes-1.5-flash",
  messages: [{ role: "user", content: "reply with only: pong" }],
  max_tokens: 32,
  temperature: 0,
});
const started = Date.now();
const req = https.request({
  protocol: url.protocol,
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname + url.search,
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
  timeout: 120000,
}, (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    const out = { ok: true, status: res.statusCode, ms: Date.now() - started, body: data.slice(0, 2000) };
    fs.writeFileSync("screenshots/api-probe-result.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
  });
});
req.on("timeout", () => req.destroy(new Error("timeout")));
req.on("error", (err) => {
  const out = { ok: false, error: err.message, ms: Date.now() - started };
  fs.writeFileSync("screenshots/api-probe-result.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  process.exitCode = 1;
});
req.write(body);
req.end();
