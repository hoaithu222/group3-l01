/**
 * Zod validator helpers — chuẩn hoá validation cho toàn hệ thống.
 *
 * Nguồn quy tắc: `docs/rules/form-validation.md`.
 *
 * Nguyên tắc:
 * - Mọi text field required qua đây sẽ TỰ ĐỘNG `.trim().min(1, msg)`.
 * - Email/Phone/IP/URL cover đủ Function TC (mail sheet).
 * - Password/token có helper riêng — KHÔNG trim (space là ký tự hợp lệ).
 *
 * Cách dùng:
 *   import { requiredText, emailField, phoneField } from './validators.utils';
 *
 *   const schema = z.object({
 *     name:  requiredText('Tên là bắt buộc').max(200),
 *     email: emailField(),
 *     phone: phoneField(),
 *   });
 */
import { z } from 'zod';

// ─── Text helpers ─────────────────────────────────────────────────────

/**
 * Required text field — auto `.trim().min(1, msg)`.
 * Whitespace-only input sẽ FAIL (`"   "` → trim thành `""` → fail min(1)).
 */
export function requiredText(msg = 'Bắt buộc') {
  return z.string().trim().min(1, msg);
}

/**
 * Optional text field — auto trim, default `''`.
 * Whitespace-only input sẽ trở thành `''`.
 */
export function optionalText() {
  return z.string().trim().optional().default('');
}

// ─── Email ────────────────────────────────────────────────────────────

/**
 * Regex email chặt chẽ hơn Zod `.email()` mặc định:
 * - Không cho `.` liền nhau
 * - Không cho `.` ngay sau `@`
 * - Yêu cầu TLD ≥ 2 ký tự
 * - Không cho `.` đầu/cuối local part
 *
 * Phủ ca: thiếu @, thiếu tên miền, thiếu TLD, có khoảng trắng, ký tự lạ.
 */
const STRICT_EMAIL_RE =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]+(?<!\.)@(?!\.)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function emailField(msg = 'Email không đúng định dạng') {
  return z
    .string()
    .trim()
    .min(1, msg)
    .max(254, 'Email tối đa 254 ký tự')
    .regex(STRICT_EMAIL_RE, msg);
}

/** Email optional (rỗng OK, có giá trị phải đúng format). */
export function optionalEmailField(msg = 'Email không đúng định dạng') {
  return z
    .string()
    .trim()
    .max(254, 'Email tối đa 254 ký tự')
    .refine((v) => v === '' || STRICT_EMAIL_RE.test(v), { message: msg })
    .optional()
    .default('');
}

// ─── Phone (Vietnam + E.164 fallback) ─────────────────────────────────

/**
 * VN mobile prefix (10 số) + fallback E.164 quốc tế `+xxx…`.
 * - 10 số bắt đầu 03/05/07/08/09
 * - Hoặc `+` + 8-15 số quốc tế
 *
 * Phủ ca: sai độ dài, có chữ, có ký tự đặc biệt, đầu số không hợp lệ.
 */
const VN_MOBILE_RE = /^(0[35789])\d{8}$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;

export function phoneField(msg = 'Số điện thoại không hợp lệ') {
  return z
    .string()
    .trim()
    .min(1, msg)
    .max(16, 'SĐT tối đa 16 ký tự')
    .refine((v) => VN_MOBILE_RE.test(v) || E164_RE.test(v), { message: msg });
}

export function optionalPhoneField(msg = 'Số điện thoại không hợp lệ') {
  return z
    .string()
    .trim()
    .max(16, 'SĐT tối đa 16 ký tự')
    .refine((v) => v === '' || VN_MOBILE_RE.test(v) || E164_RE.test(v), { message: msg })
    .optional()
    .default('');
}

// ─── IP Address ───────────────────────────────────────────────────────

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * IPv4 chuẩn (0.0.0.0 - 255.255.255.255).
 *
 * Phủ ca: quá 4 nhóm, nhóm > 255, có chữ, thiếu dấu chấm.
 */
export function ipv4Field(msg = 'IP không hợp lệ') {
  return z.string().trim().min(1, msg).regex(IPV4_RE, msg);
}

/** IPv4 + port `192.168.1.1:8080` — port 1-65535. */
export function ipv4WithPortField(msg = 'IP:Port không hợp lệ') {
  return z
    .string()
    .trim()
    .min(1, msg)
    .refine(
      (v) => {
        const [ip, port] = v.split(':');
        if (!ip || !port) return false;
        if (!IPV4_RE.test(ip)) return false;
        const p = Number(port);
        return Number.isInteger(p) && p >= 1 && p <= 65535;
      },
      { message: msg },
    );
}

// ─── URL ──────────────────────────────────────────────────────────────

/**
 * URL với protocol bắt buộc (http/https).
 * Dùng URL constructor để validate — chấp nhận query, hash, path.
 */
export function urlField(msg = 'URL không hợp lệ') {
  return z
    .string()
    .trim()
    .min(1, msg)
    .max(2048, 'URL tối đa 2048 ký tự')
    .refine(
      (v) => {
        try {
          const u = new URL(v);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: msg },
    );
}

// ─── Password ─────────────────────────────────────────────────────────

/**
 * Password: 8-128 ký tự, KHÔNG trim (space là ký tự hợp lệ).
 *
 * Mặc định khớp chính sách MỘT chỗ của BE (`newPasswordSchema` ở
 * `be/src/modules/auth/dtos/auth.dto.ts`: 8–128, KHÔNG bắt buộc chữ hoa/số theo
 * NIST 800-63B) — form admin chặt hơn BE thì người dùng bị từ chối oan, lỏng hơn thì
 * chỉ biết lỗi sau một vòng gọi API. Cần siết thêm regex thì dùng `strongPasswordField`.
 */
export function passwordField(min = 8, max = 128) {
  return z
    .string()
    .min(min, `Mật khẩu tối thiểu ${min} ký tự`)
    .max(max, `Mật khẩu tối đa ${max} ký tự`);
}

/**
 * Strong password: ≥ 8 ký tự, có chữ hoa + chữ thường + số.
 * Optional special char via `requireSpecial`.
 */
export function strongPasswordField(opts: { requireSpecial?: boolean } = {}) {
  const { requireSpecial = false } = opts;
  let s = z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(64, 'Mật khẩu tối đa 64 ký tự')
    .regex(/[a-z]/, 'Phải có chữ thường')
    .regex(/[A-Z]/, 'Phải có chữ hoa')
    .regex(/\d/, 'Phải có số');
  if (requireSpecial) {
    s = s.regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, 'Phải có ký tự đặc biệt');
  }
  return s;
}

// ─── Number / Percent ─────────────────────────────────────────────────

/**
 * Percent 0-100.
 * Phần trăm: dưới 0 và trên 100 đều không hợp lệ.
 */
export function percentField(msg = 'Giá trị phải từ 0 đến 100') {
  return z.coerce.number().min(0, msg).max(100, msg);
}

/**
 * Positive integer (≥ 0, integer).
 */
export function positiveIntField(msg = 'Phải là số nguyên không âm') {
  return z.coerce.number().int(msg).min(0, msg);
}

// ─── Date range refine helper ─────────────────────────────────────────

/**
 * Refine helper — đảm bảo start ≤ end trong 1 object schema.
 *
 * Ví dụ:
 *   z.object({ startDate: ..., endDate: ... }).refine(...ensureRangeOrder('startDate', 'endDate'))
 */
export function ensureRangeOrder<S extends string, E extends string>(
  startKey: S,
  endKey: E,
  msg = 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
) {
  return [
    (v: Record<string, unknown>) => {
      const s = v[startKey];
      const e = v[endKey];
      if (!s || !e || typeof s !== 'string' || typeof e !== 'string') return true;
      return new Date(s).getTime() <= new Date(e).getTime();
    },
    { message: msg, path: [endKey] as [E] },
  ] as const;
}

// ─── Duplicate check helper ───────────────────────────────────────────

/**
 * Set-based duplicate check case-insensitive (đã trim + uppercase).
 * Dùng để build `existingCodes` set trước khi validate submit.
 *
 * Ví dụ:
 *   const codes = buildCodeSet(items, editingId, (u) => u.code);
 *   if (codes.has(values.code.trim().toUpperCase())) {
 *     form.setError('code', { message: 'Mã đã tồn tại' });
 *     throw new Error('duplicate');
 *   }
 */
export function buildCodeSet<T>(
  items: readonly T[],
  editingId: string | number | undefined,
  getCode: (item: T) => string,
  getId: (item: T) => string | number = (i) => (i as { id: string | number }).id,
): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    if (editingId != null && getId(item) === editingId) continue;
    const c = getCode(item);
    if (typeof c === 'string' && c.trim() !== '') {
      set.add(c.trim().toUpperCase());
    }
  }
  return set;
}
