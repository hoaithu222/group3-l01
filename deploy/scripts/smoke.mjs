#!/usr/bin/env node
/**
 * Smoke test sau deploy (p0-11 §3 / OPS-10) — KHÔNG phụ thuộc gói ngoài (Node ≥ 22: `fetch` + `WebSocket` có sẵn).
 *
 * Kiểm theo thứ tự (dừng ở lỗi đầu tiên, thoát mã 1):
 *  1. `GET /api/health` → 200 (thử lại tới SMOKE_WAIT_SECONDS để chờ stack lên) và `GET /api/health/live` → 200.
 *  2. Universal/App links: `/.well-known/apple-app-site-association` (200, application/json, KHÔNG redirect, có `applinks`) và `/.well-known/assetlinks.json` (200, mảng có package_name).
 *  3. (tuỳ chọn) admin SPA: `SMOKE_ADMIN_URL` → 200 và có `id="root"`.
 *  4. (chỉ khi SMOKE_LOGIN=1) đăng nhập tài khoản e2e → `GET /api/v1/capabilities` (200) → kết nối Socket.IO (Engine.IO v4 qua WebSocket thô, handshake `auth.token`) → đăng xuất.
 *     Production KHÔNG bật SMOKE_LOGIN (không tạo phiên/dữ liệu) — chỉ bước 1–3.
 *
 * Env:  BASE_URL (bắt buộc, vd https://staging.superapp.vcijsc.com) · SMOKE_ADMIN_URL · SMOKE_WAIT_SECONDS (mặc định 120)
 *       SMOKE_LOGIN=1 · SMOKE_EMAIL · SMOKE_PASSWORD (user e2e — bị khoá quyền admin thật, p0-10) · SMOKE_EXPECT_ANDROID_PACKAGE (mặc định com.mancode.vungnui)
 * ⛔ Không in token/mật khẩu; chỉ in mã trạng thái và tên bước.
 */

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const ADMIN_URL = (process.env.SMOKE_ADMIN_URL ?? '').replace(/\/+$/, '');
const WAIT_SECONDS = Number(process.env.SMOKE_WAIT_SECONDS ?? 120);
const LOGIN = process.env.SMOKE_LOGIN === '1';
const ANDROID_PACKAGE = process.env.SMOKE_EXPECT_ANDROID_PACKAGE ?? 'com.mancode.vungnui';

const log = (msg) => console.log(`[smoke] ${msg}`);
function fail(msg) {
  console.error(`[smoke] ❌ ${msg}`);
  process.exit(1);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });
  return res;
}

async function waitForHealth() {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let last = 'chưa có phản hồi';
  while (Date.now() < deadline) {
    try {
      const res = await get('/api/health');
      const body = await res.json().catch(() => ({}));
      if (res.status === 200 && body.success !== false) return body;
      last = `HTTP ${res.status} ${body?.status ?? ''}`.trim();
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await sleep(5000);
  }
  return fail(`/api/health không đạt 200 sau ${WAIT_SECONDS}s (${last})`);
}

async function checkAppLinks() {
  const aasa = await get('/.well-known/apple-app-site-association');
  if (aasa.status !== 200) fail(`AASA: HTTP ${aasa.status} (phải 200, KHÔNG redirect)`);
  if (!(aasa.headers.get('content-type') ?? '').includes('application/json')) fail(`AASA: Content-Type phải là application/json (đang ${aasa.headers.get('content-type')})`);
  const aasaJson = await aasa.json().catch(() => null);
  if (!aasaJson?.applinks?.details?.[0]?.appIDs?.length) fail('AASA: thiếu applinks.details[0].appIDs');
  if (aasaJson.applinks.details[0].appIDs.some((id) => id.includes('${') || id.startsWith('.'))) fail('AASA: appIDs chưa render (thiếu APPLE_TEAM_ID)');

  const links = await get('/.well-known/assetlinks.json');
  if (links.status !== 200) fail(`assetlinks.json: HTTP ${links.status}`);
  const linksJson = await links.json().catch(() => null);
  const target = Array.isArray(linksJson) ? linksJson[0]?.target : null;
  if (target?.package_name !== ANDROID_PACKAGE) fail(`assetlinks.json: package_name phải là ${ANDROID_PACKAGE}`);
  if (!target.sha256_cert_fingerprints?.length) fail('assetlinks.json: thiếu sha256_cert_fingerprints (chưa điền ANDROID_SHA256_FINGERPRINTS)');
  log('app links OK (AASA + assetlinks)');
}

async function checkAdmin() {
  const res = await fetch(`${ADMIN_URL}/`, { signal: AbortSignal.timeout(15_000) });
  const html = await res.text();
  if (res.status !== 200 || !html.includes('id="root"')) fail(`admin ${ADMIN_URL}: HTTP ${res.status} hoặc thiếu #root`);
  log('admin SPA OK');
}

/** Engine.IO v4 thô: open packet `0{...}` → gửi `40{auth}` → nhận `40{sid}` (đã kết nối) hoặc `44{...}` (bị từ chối). */
function checkSocket(accessToken) {
  const url = `${BASE_URL.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('socket: quá 10s chưa nhận gói kết nối'));
    }, 10_000);
    ws.addEventListener('message', (event) => {
      const data = String(event.data);
      if (data.startsWith('0')) ws.send(`40${JSON.stringify({ token: accessToken, platform: 'ANDROID', deviceId: 'smoke-test' })}`);
      else if (data === '2') ws.send('3'); // ping → pong
      else if (data.startsWith('40')) {
        clearTimeout(timer);
        ws.close();
        resolve();
      } else if (data.startsWith('44')) {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`socket bị từ chối: ${data.slice(0, 120)}`));
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('socket: lỗi kết nối WebSocket (kiểm nginx Upgrade / TLS)'));
    });
  });
}

async function checkAuthenticated() {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) fail('SMOKE_LOGIN=1 nhưng thiếu SMOKE_EMAIL/SMOKE_PASSWORD');

  const nonceRes = await get('/api/v1/auth/nonce');
  const nonce = (await nonceRes.json().catch(() => ({})))?.data?.nonce;
  if (nonceRes.status !== 200 || !nonce) fail(`GET /auth/nonce: HTTP ${nonceRes.status}`);

  const loginRes = await get('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ANDROID', 'X-Device-Id': 'smoke-test' },
    body: JSON.stringify({ email, password, nonce }),
  });
  const accessToken = (await loginRes.json().catch(() => ({})))?.data?.accessToken;
  if (loginRes.status !== 200 || !accessToken) fail(`đăng nhập e2e: HTTP ${loginRes.status}`);
  log('đăng nhập OK');

  try {
    const cap = await get('/api/v1/capabilities', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (cap.status !== 200) fail(`GET /capabilities: HTTP ${cap.status}`);
    log('capabilities OK');
    await checkSocket(accessToken).catch((err) => fail(err.message));
    log('socket OK (handshake xác thực qua nginx)');
  } finally {
    // Dọn phiên smoke (best-effort — lỗi ở đây không làm hỏng kết quả).
    await get('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'X-Client-Platform': 'ANDROID' } }).catch(() => undefined);
  }
}

if (!BASE_URL) fail('thiếu BASE_URL (vd https://staging.superapp.vcijsc.com)');
if (typeof WebSocket === 'undefined' && LOGIN) fail('cần Node ≥ 22 (WebSocket toàn cục) để kiểm socket');

const health = await waitForHealth();
log(`/api/health OK (version ${health.version ?? '?'}, services ${JSON.stringify(health.services ?? {})})`);
const live = await get('/api/health/live');
if (live.status !== 200) fail(`/api/health/live: HTTP ${live.status}`);
log('/api/health/live OK');
await checkAppLinks();
if (ADMIN_URL) await checkAdmin();
if (LOGIN) await checkAuthenticated();
else log('bỏ qua đăng nhập/capabilities/socket (SMOKE_LOGIN != 1 — production không tạo phiên)');
log('✅ smoke đạt');
