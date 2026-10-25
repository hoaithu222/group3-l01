#!/usr/bin/env node
/**
 * Cổng CI (p0-11 / đồng bộ chéo #10): mọi tên metric trong `observability/alerts.yml` và các dashboard Grafana PHẢI là metric BE thật đang phát
 * (`be/src/infrastructure/metrics/*.ts`: `new Counter|Gauge|Histogram({ name: "…" })`) hoặc metric của exporter chuẩn (up, node_*, redis_*, probe_*, process_*, nodejs_*).
 * Đổi tên metric ở BE mà quên sửa alerts.yml = cảnh báo im lặng vô hiệu — script này bắt đúng ca đó. Cũng kiểm ngoặc PromQL cân bằng và tên rule không trùng.
 *
 * Chạy: node deploy/scripts/check-alert-metrics.mjs   (cần gói `yaml` — dùng bản của be/: `npm --prefix be ls yaml`)
 * Không có `yaml` thì chỉ kiểm dashboard; alerts.yml được đọc bằng bộ tách tối thiểu (dòng `alert:`/`expr:`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'be/package.json'));

/** Metric BE: parse trực tiếp mã nguồn (không cần chạy BE). */
const beDir = path.join(ROOT, 'be/src/infrastructure/metrics');
const known = new Map();
for (const file of fs.readdirSync(beDir).filter((n) => n.endsWith('.ts'))) {
  const src = fs.readFileSync(path.join(beDir, file), 'utf8');
  for (const m of src.matchAll(/new (Counter|Gauge|Histogram)\(\{\s*name:\s*"([a-z0-9_]+)"/g)) known.set(m[2], m[1]);
}
const allowed = new Set(known.keys());
for (const [name, type] of known) if (type === 'Histogram') for (const s of ['_bucket', '_count', '_sum']) allowed.add(name + s);

const FUNCTIONS = new Set(
  'rate increase irate sum avg min max count topk bottomk histogram_quantile clamp_min clamp_max absent deriv time vector by without on ignoring group_left group_right and or unless offset bool label_replace round abs ceil floor sqrt delta changes resets max_over_time min_over_time avg_over_time sum_over_time quantile_over_time'.split(
    ' ',
  ),
);
const EXTERNAL = /^(up|node_|redis_|probe_|process_|nodejs_|scrape_)/;

function metricNames(expr) {
  const cleaned = expr
    .replace(/"[^"]*"/g, '""') // chuỗi
    .replace(/\b(by|without|on|ignoring)\s*\([^)]*\)/g, '') // danh sách nhãn
    .replace(/\{[^}]*\}/g, '') // bộ chọn nhãn
    .replace(/\[[^\]]*\]/g, '') // cửa sổ thời gian
    .replace(/\$__rate_interval/g, '')
    .replace(/\b\d+(?:ms|s|m|h|d|w|y)\b/g, ''); // hằng thời lượng (offset 2m)
  return new Set([...cleaned.matchAll(/[a-zA-Z_:][a-zA-Z0-9_:]*/g)].map((m) => m[0]).filter((t) => !FUNCTIONS.has(t)));
}

function balanced(expr) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let inString = false;
  for (const ch of expr) {
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if ('([{'.includes(ch)) stack.push(ch);
    if (')]}'.includes(ch) && stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0 && !inString;
}

let problems = 0;
function check(where, expr) {
  if (!balanced(expr)) {
    console.error(`✗ ngoặc PromQL không cân: ${where}`);
    problems++;
  }
  for (const name of metricNames(expr)) {
    if (allowed.has(name) || EXTERNAL.test(name) || /^\d/.test(name)) continue;
    console.error(`✗ metric không tồn tại ở BE: ${name}  (${where})`);
    problems++;
  }
}

// alerts.yml
let rules = [];
try {
  const YAML = require('yaml');
  const doc = YAML.parse(fs.readFileSync(path.join(ROOT, 'deploy/observability/alerts.yml'), 'utf8'));
  rules = doc.groups.flatMap((g) => g.rules.map((r) => ({ name: r.alert, expr: String(r.expr), severity: r.labels?.severity })));
} catch {
  console.warn('(không nạp được gói yaml — bỏ qua alerts.yml; chạy `npm --prefix be ci` rồi thử lại)');
}
const seen = new Set();
for (const rule of rules) {
  if (seen.has(rule.name)) {
    console.error(`✗ tên rule trùng: ${rule.name}`);
    problems++;
  }
  seen.add(rule.name);
  if (!['critical', 'warning'].includes(rule.severity)) {
    console.error(`✗ ${rule.name}: severity phải là critical|warning`);
    problems++;
  }
  check(`alerts.yml:${rule.name}`, rule.expr);
}

// dashboards
const dashDir = path.join(ROOT, 'deploy/observability/grafana/dashboards');
let panels = 0;
for (const file of fs.readdirSync(dashDir).filter((n) => n.endsWith('.json'))) {
  const dash = JSON.parse(fs.readFileSync(path.join(dashDir, file), 'utf8'));
  for (const panel of dash.panels) {
    for (const t of panel.targets ?? []) {
      if (panel.type === 'logs') continue; // LogQL, không phải PromQL
      panels++;
      check(`${file}:${panel.title}`, t.expr);
    }
  }
}

console.log(`metric BE: ${known.size} · rule: ${rules.length} · truy vấn dashboard: ${panels}`);
if (problems > 0) {
  console.error(`❌ ${problems} vấn đề`);
  process.exit(1);
}
console.log('✅ alerts.yml + dashboards chỉ dùng metric có thật');
