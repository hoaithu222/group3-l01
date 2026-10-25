#!/usr/bin/env node
/**
 * privacy-guard — Kiro PreToolUse hook (tương đương privacy-block hook của ClaudeKit).
 *
 * Được gọi bởi `.kiro/hooks/privacy-guard.json` với lệnh `node .kiro/scripts/privacy-guard.cjs`.
 * Kiro truyền sự kiện hook qua STDIN dạng JSON:
 *   { "hook_event_name": "preToolUse", "cwd": "...", "session_id": "...",
 *     "tool_name": "...", "tool_input": { ... } }
 *
 * Nếu tool sắp đọc/ghi/xoá file bí mật (.env*, private key, service account, client secret...)
 * thì in ra quyết định "ask" để Kiro hỏi người dùng xác nhận trước khi chạy tool.
 * Mọi trường hợp khác (không có STDIN, JSON hỏng, không phát hiện gì) => cho qua (exit 0).
 */
'use strict';

// File mẫu, không chứa bí mật — được đọc tự do.
const ENV_ALLOWLIST = new Set(['.env.example', '.env.sample', '.env.template']);

// Mẫu tên file (basename) bị coi là bí mật — khớp với .gitignore của be/app/admin.
const SECRET_BASENAME_PATTERNS = [
  /\.(pem|key|p8|p12|pfx|jks|keystore|mobileprovision)$/i, // private key, chứng chỉ, keystore
  /firebase-adminsdk.*\.json$/i, // Firebase Admin SDK service account
  /service[-_]?account.*\.json$/i, // *service-account*.json, serviceAccountKey*.json
  /^client_secret.*\.json$/i, // Google OAuth client secret
  /^credentials.*\.json$/i,
  /^google-services\.json$/i, // cấu hình Firebase Android (dự án coi là secret)
  /^googleservice-info\.plist$/i, // cấu hình Firebase iOS (dự án coi là secret)
  /^id_(rsa|dsa|ecdsa|ed25519)$/i, // SSH private key
];

// Khoá trong tool_input chứa đường dẫn hoặc glob.
const PATH_KEY = /path|file|target|source|dest|dir|cwd|pattern|glob|uri|url/i;
// Khoá trong tool_input chứa lệnh shell.
const COMMAND_KEY = /^(command|cmd|script)$/i;
// Tách token trong lệnh shell (bash, cmd, PowerShell).
const COMMAND_SPLIT = /[\s"'`|&;<>(),=]+/;

/**
 * @param {string} raw      Đường dẫn, glob hoặc token lấy từ lệnh shell.
 * @param {boolean} fromCommand  true nếu token lấy từ lệnh shell (bỏ qua chữ "secrets" đứng một mình).
 */
function isSecretPath(raw, fromCommand) {
  if (typeof raw !== 'string') return false;
  const value = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!value) return false;

  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return false;

  const hasSecretsDir = segments.some((s) => s.toLowerCase() === 'secrets');
  if (hasSecretsDir && !(fromCommand && segments.length === 1)) return true;

  const base = segments[segments.length - 1];
  const lower = base.toLowerCase();
  if (lower.startsWith('.env') && !ENV_ALLOWLIST.has(lower)) return true;

  return SECRET_BASENAME_PATTERNS.some((re) => re.test(base));
}

function collectFindings(node, key, found, depth) {
  if (node == null || depth > 10) return;

  if (typeof node === 'string') {
    if (key && COMMAND_KEY.test(key)) {
      for (const token of node.split(COMMAND_SPLIT)) {
        if (isSecretPath(token, true)) found.add(token);
      }
    } else if (key && PATH_KEY.test(key) && isSecretPath(node, false)) {
      found.add(node);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectFindings(item, key, found, depth + 1);
    return;
  }

  if (typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node)) {
      collectFindings(value, childKey, found, depth + 1);
    }
  }
}

function main(raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0); // Không đọc được sự kiện => không chặn.
  }
  if (!event || typeof event !== 'object') process.exit(0);

  const toolName = String(event.tool_name ?? event.toolName ?? 'unknown');
  const toolInput =
    event.tool_input ?? event.toolInput ?? event.input ?? event.arguments ?? event.parameters;

  const found = new Set();
  collectFindings(toolInput === undefined ? event : toolInput, '', found, 0);
  if (found.size === 0) process.exit(0);

  const list = [...found].slice(0, 5).join(', ');
  const reason =
    `privacy-guard: tool "${toolName}" sắp truy cập file nhạy cảm (${list}). ` +
    'Chỉ cho phép khi thật sự cần — nội dung file sẽ đi vào ngữ cảnh của AI.';

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

if (process.stdin.isTTY) process.exit(0);

// Không bao giờ treo quá lâu: hết thời gian thì cho qua thay vì làm tool bị timeout.
setTimeout(() => process.exit(0), 4000).unref();

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => main(input));
process.stdin.on('error', () => process.exit(0));
