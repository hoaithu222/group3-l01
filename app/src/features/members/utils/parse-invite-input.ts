/**
 * Bóc MÃ MỜI khỏi thứ người dùng dán / gõ / quét — đầu vào chung của `JoinByCodeScreen` và
 * `ScanInviteScreen`.
 *
 * ── Vì sao có hàm này ───────────────────────────────────────────────────────
 * Link mời mang nhiều dạng tuỳ môi trường: dev là `http://localhost:8081/invite/<token>` (không mở được
 * app), prod là `https://<APP_LINK_DOMAIN>/invite/<token>` (chỉ mở app khi App Links đã xác thực), scheme
 * riêng `superapp://invite/<token>`, còn lời mời email đích danh là `…/invite/e/<token>`. Trên máy ảo
 * Android không bấm được link ⇒ người dùng phải DÁN hoặc QUÉT nó vào app — và thứ họ dán hiếm khi sạch
 * (xuống dòng thừa, dấu ngoặc, chữ "Link mời: " đứng trước).
 *
 * ⚠️ Cố ý KHÔNG dùng `new URL()`: Hermes chỉ hỗ trợ một phần URL API, và `superapp://invite/<token>` có
 * `invite` làm HOST chứ không phải path — mỗi dạng một cách bóc. Tìm thẳng đoạn `invite/<token>` bằng
 * regex thì mọi scheme/host/query/hash đều đi cùng một đường.
 *
 * ── Luật ────────────────────────────────────────────────────────────────────
 * · token = ĐÚNG 43 ký tự base64url `[A-Za-z0-9_-]` (32 byte ngẫu nhiên, không đệm —
 *   `be/src/modules/members/services/invite-token.util.ts`). Sai độ dài (42, 44) hay có ký tự lạ ⇒ `null`;
 *   ⛔ không "cắt cho vừa": token cắt là token khác, BE trả 404 và người dùng đổ lỗi cho link.
 * · ⛔ Token PHÂN BIỆT hoa/thường — không `toLowerCase()`. Đổi một chữ là thành token khác. Chỉ hai chữ
 *   `invite` và `e` của đường dẫn được so không phân biệt hoa/thường.
 * · Nhiều đoạn hợp lệ trong cùng một chuỗi ⇒ lấy đoạn đứng TRƯỚC.
 */

/** `LINK` = link mời chung (`/invite/<token>`); `EMAIL` = lời mời đích danh (`/invite/e/<token>`). */
export type InviteKind = 'LINK' | 'EMAIL';

export interface ParsedInvite {
  kind: InviteKind;
  token: string;
}

const TOKEN = '[A-Za-z0-9_-]{43}';

/**
 * ⚠️ `(?![A-Za-z0-9_-])` chốt ĐÚNG 43: token dài 44 ký tự là sai độ dài chứ không phải "43 ký tự đầu +
 * một ký tự thừa". Dấu chấm/phẩy/ngoặc/`?`/`#`/`/` sau token thì vẫn hợp lệ (không thuộc bảng ký tự token).
 */
const END = '(?![A-Za-z0-9_-])';

/** `invite/<token>` hoặc `invite/e/<token>`; trước đó phải là đầu chuỗi hoặc ký tự KHÔNG thuộc token. */
const INVITE_PATH = new RegExp(`(?:^|[^A-Za-z0-9_-])invite/(e/)?(${TOKEN})${END}`, 'i');

/**
 * Token trần. ⚠️ Không nhận khi đứng sau `/ = & ? # % + ~ @ .` — đó là mảnh của một URL hay đường dẫn
 * KHÁC (`https://x.y/w/<43 ký tự>`), không phải mã mời người ta dán; nhận nhầm là đẩy người dùng sang một
 * màn "không tìm thấy lời mời" thay vì báo link sai ngay tại ô nhập.
 */
const BARE_TOKEN = new RegExp(`(?:^|[^A-Za-z0-9_/=&?#%+~@.-])(${TOKEN})${END}`);

export function parseInviteInput(raw: string): ParsedInvite | null {
  const byPath = INVITE_PATH.exec(raw);
  const bare = BARE_TOKEN.exec(raw);

  // Hai tập khớp không giao nhau (token trần không bao giờ đứng sau `/`), nên chỉ cần so vị trí.
  if (byPath?.[2] && (!bare || byPath.index <= bare.index)) {
    return { kind: byPath[1] ? 'EMAIL' : 'LINK', token: byPath[2] };
  }
  if (bare?.[1]) return { kind: 'LINK', token: bare[1] };
  return null;
}
