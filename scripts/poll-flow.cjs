const fs = require("fs");
const { spawnSync, execSync } = require("child_process");
const waitMs = Number(process.argv[2] || 90000);
const start = Date.now();
function sleep(ms) {
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}
function stillRunning() {
  try {
    const out = execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -match 'real-user-flow' } | Select-Object -ExpandProperty ProcessId\"", { encoding: "utf8" });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
while (Date.now() - start < waitMs) {
  const log = fs.existsSync("screenshots/flow-run.log") ? fs.readFileSync("screenshots/flow-run.log", "utf8") : "";
  if (log.includes("==== SUMMARY ====")) break;
  if (!stillRunning()) break;
  sleep(5000);
}
const log = fs.existsSync("screenshots/flow-run.log") ? fs.readFileSync("screenshots/flow-run.log", "utf8") : "";
console.log(log.split(/\n/).slice(-50).join("\n"));
if (fs.existsSync("screenshots/flow-report.json")) {
  const r = JSON.parse(fs.readFileSync("screenshots/flow-report.json", "utf8"));
  console.log(JSON.stringify({
    ok: r.okCount,
    fail: r.failCount,
    steps: r.steps.map((s) => [s.ok, s.step, String(s.detail || "").slice(0, 140)]),
    ai: r.aiCalls.map((c) => ({ status: c.status, ok: c.ok, ms: c.ms, err: c.error })),
  }, null, 2));
}
console.log("elapsedMs", Date.now() - start, "running", stillRunning());
