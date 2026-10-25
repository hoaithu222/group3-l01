/**
 * @file html-sanitizer.ts
 * @description Allowlist-based HTML sanitizer (zero dependency).
 *
 * Thay thế cách tiếp cận "blacklist bằng regex" (strip `<script>`, strip `on*=`)
 * vốn bị bypass rất dễ:
 *   - `<img src=x onerror=alert(1)>`      → handler không có dấu nháy
 *   - `<svg/onload=alert(1)>`             → dấu `/` thay khoảng trắng
 *   - `<a href="jav&#x09;ascript:...">`   → HTML entity trong scheme
 *   - `<iframe srcdoc="&lt;script&gt;">`  → payload đã được encode
 *
 * Nguyên tắc ở đây là ngược lại — FAIL CLOSED:
 *   1. Parse từng tag một.
 *   2. Tag không nằm trong allowlist → bỏ luôn cả tag (và nội dung nếu là
 *      tag nguy hiểm như script/style/iframe).
 *   3. Attribute không nằm trong allowlist của tag đó → bỏ.
 *   4. URL attribute (href/src) phải qua `isSafeUrl` — chỉ http/https/mailto/tel
 *      và relative path; mọi thứ khác (javascript:, data:, vbscript:, blob:)
 *      đều bị loại sau khi đã decode entity + strip ký tự điều khiển.
 *   5. Giá trị attribute luôn được re-encode khi ghi ra → không thể thoát ra
 *      khỏi dấu nháy.
 *
 * Đây là lớp phòng thủ phía server. Phía client vẫn phải escape/DOMPurify khi
 * render (defense-in-depth) — không lớp nào được coi là đủ một mình.
 */

/** Tag được phép giữ lại, kèm danh sách attribute hợp lệ của riêng nó. */
const ALLOWED: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  s: [],
  del: [],
  ins: [],
  mark: [],
  sub: [],
  sup: [],
  small: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ["start"],
  li: [],
  dl: [],
  dt: [],
  dd: [],
  blockquote: ["cite"],
  pre: [],
  code: ["class"],
  span: [],
  div: [],
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  caption: [],
  figure: [],
  figcaption: [],
};

/** Tag rỗng — không có thẻ đóng. */
const VOID_TAGS = new Set(["br", "hr", "img"]);

/**
 * Tag mà toàn bộ NỘI DUNG bên trong cũng phải bị xoá, không chỉ riêng thẻ.
 * `<script>alert(1)</script>` mà chỉ xoá thẻ sẽ để lại `alert(1)` — vô hại ở
 * dạng text nhưng `<style>` hay `<iframe srcdoc>` thì không.
 */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "frame",
  "frameset",
  "noscript",
  "template",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "title",
  "head",
  "body",
  "html",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "portal",
]);

/** Attribute nào được coi là URL và phải qua kiểm tra scheme. */
const URL_ATTRS = new Set(["href", "src", "cite"]);

/** Scheme được phép trong URL attribute. */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Decode HTML entity (numeric + named cơ bản) để phát hiện scheme bị che giấu,
 * ví dụ `&#106;avascript:` hoặc `&#x6a;avascript:`.
 * Lặp tối đa 3 vòng để bắt trường hợp double-encoding.
 */
function decodeEntities(input: string): string {
  const NAMED: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'",
    nbsp: " ",
    tab: "\t",
    newline: "\n",
    colon: ":",
    sol: "/",
  };

  let out = input;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      if (body.startsWith("#")) {
        const code = parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      const named = NAMED[body.toLowerCase()];
      return named !== undefined ? named : match;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Kiểm tra một URL attribute có an toàn không.
 *
 * Chuẩn hoá trước khi kiểm tra:
 *   - decode entity (chống `&#106;avascript:`)
 *   - xoá ký tự điều khiển + khoảng trắng vô hình (chống `java\tscript:`)
 *   - bỏ BOM / zero-width (chống `java` + U+200B + `script:`)
 */
export function isSafeUrl(raw: string): boolean {
  const normalized = decodeEntities(raw)
    // Ký tự điều khiển C0/C1, zero-width, BOM — trình duyệt bỏ qua chúng khi
    // phân giải scheme nên chúng ta cũng phải bỏ trước khi so khớp.
    // eslint-disable-next-line no-control-regex, no-irregular-whitespace
    .replace(/[\u0000-\u001F\u007F-\u009F\u180E\u200B-\u200F\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]/g, "")
    .trim();

  if (normalized === "") return false;

  // Relative URL / anchor / query — không có scheme nên an toàn.
  // Lưu ý `//evil.com` là protocol-relative → coi như external, vẫn cho phép
  // vì nó chỉ có thể là http(s), nhưng chặn `\\evil.com` (backslash bị một số
  // trình duyệt chuẩn hoá thành `//`).
  if (normalized.startsWith("\\")) return false;
  if (/^(#|\/|\.\/|\.\.\/|\?)/.test(normalized)) return true;

  // Không có dấu ":" trước dấu "/" đầu tiên → là relative path.
  const colonIndex = normalized.indexOf(":");
  if (colonIndex === -1) return true;
  const slashIndex = normalized.indexOf("/");
  if (slashIndex !== -1 && slashIndex < colonIndex) return true;

  const scheme = normalized.slice(0, colonIndex + 1).toLowerCase();
  return SAFE_SCHEMES.has(scheme);
}

/** Escape để ghi giá trị vào trong dấu nháy kép của attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape text node. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tách attribute từ phần đuôi của một tag mở. */
function parseAttributes(source: string): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    result.push({ name, value });
  }
  return result;
}

/**
 * Sanitize một chuỗi HTML theo allowlist.
 * Trả về HTML đã được làm sạch — an toàn để lưu và (kết hợp với escape ở
 * tầng render) để hiển thị.
 */
export function sanitizeHtml(input: string): string {
  if (input === "") return "";

  const out: string[] = [];
  // Stack các tag đang mở để đóng đúng thứ tự và bỏ nội dung của tag nguy hiểm.
  const openStack: string[] = [];
  let dropDepth = 0;
  let dropTag = "";

  // Bắt: comment, CDATA, doctype, tag đóng, tag mở.
  //
  // Lưu ý: KHÔNG cho phép khoảng trắng giữa `<` và tên tag. Theo HTML5
  // tokenizer, `<` mà ký tự ngay sau không phải chữ cái / `!` / `/` / `?`
  // được emit như text thường — nên `a < b và c > d` là văn bản, không phải
  // thẻ `<b>`. Cho phép `\s*` ở đây sẽ ăn mất nội dung hợp lệ của người dùng.
  const tokenRe = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][^\s/>]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>/g;

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(input)) !== null) {
    const text = input.slice(cursor, match.index);
    if (text !== "" && dropDepth === 0) out.push(escapeText(text));
    cursor = tokenRe.lastIndex;

    const closeTag = match[1]?.toLowerCase();
    const openTag = match[2]?.toLowerCase();

    // Comment / doctype / CDATA — bỏ hoàn toàn.
    if (closeTag === undefined && openTag === undefined) continue;

    // ── Tag đóng ────────────────────────────────────────────────────────────
    if (closeTag !== undefined) {
      if (dropDepth > 0) {
        if (closeTag === dropTag) {
          dropDepth -= 1;
          if (dropDepth === 0) dropTag = "";
        }
        continue;
      }
      const idx = openStack.lastIndexOf(closeTag);
      if (idx === -1) continue; // tag đóng lạc — bỏ
      // Đóng luôn các tag lồng chưa đóng để HTML output luôn cân bằng.
      for (let i = openStack.length - 1; i >= idx; i--) {
        out.push(`</${openStack[i]}>`);
      }
      openStack.length = idx;
      continue;
    }

    // ── Tag mở ──────────────────────────────────────────────────────────────
    const name = openTag as string;

    if (dropDepth > 0) {
      // Đang bên trong tag bị loại — chỉ cần theo dõi độ sâu.
      if (name === dropTag && !VOID_TAGS.has(name)) dropDepth += 1;
      continue;
    }

    if (DROP_WITH_CONTENT.has(name)) {
      // Tag tự đóng (`<img/>` style) thì không mở vùng drop.
      const selfClosing = match[0].endsWith("/>");
      if (!selfClosing) {
        dropDepth = 1;
        dropTag = name;
      }
      continue;
    }

    const allowedAttrs = ALLOWED[name];
    if (allowedAttrs === undefined) {
      // Tag lạ nhưng không nguy hiểm (vd `<marquee>`) — bỏ thẻ, giữ nội dung.
      continue;
    }

    const attrs = parseAttributes(match[3] ?? "");
    const rendered: string[] = [];

    for (const { name: attrName, value } of attrs) {
      // Chặn mọi event handler, kể cả biến thể không nằm trong allowlist.
      if (attrName.startsWith("on")) continue;
      if (!allowedAttrs.includes(attrName)) continue;
      if (URL_ATTRS.has(attrName) && !isSafeUrl(value)) continue;
      // `class` chỉ cho phép ký tự an toàn (dùng cho code highlight).
      if (attrName === "class" && !/^[-a-zA-Z0-9_ ]{0,120}$/.test(value)) continue;
      rendered.push(`${attrName}="${escapeAttr(value)}"`);
    }

    // Link mở tab mới luôn phải có rel chống tabnabbing.
    if (name === "a") {
      const hasTargetBlank = rendered.some((a) => a === 'target="_blank"');
      if (hasTargetBlank && !rendered.some((a) => a.startsWith("rel="))) {
        rendered.push('rel="noopener noreferrer"');
      }
    }

    const attrString = rendered.length > 0 ? ` ${rendered.join(" ")}` : "";

    if (VOID_TAGS.has(name)) {
      out.push(`<${name}${attrString} />`);
    } else {
      out.push(`<${name}${attrString}>`);
      openStack.push(name);
    }
  }

  // Text còn lại sau token cuối cùng.
  if (dropDepth === 0) {
    const tail = input.slice(cursor);
    if (tail !== "") out.push(escapeText(tail));
  }

  // Đóng mọi tag còn mở.
  for (let i = openStack.length - 1; i >= 0; i--) {
    out.push(`</${openStack[i]}>`);
  }

  return out.join("");
}

/**
 * Strip toàn bộ HTML, chỉ giữ lại text.
 * Dùng cho field thường (title, name, email, ...) — nơi HTML không bao giờ hợp lệ.
 */
export function stripHtml(input: string): string {
  // Sanitize trước rồi mới bỏ thẻ: đảm bảo nội dung của <script>/<style>
  // cũng biến mất thay vì rơi lại thành text.
  const safe = sanitizeHtml(input);
  return safe
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
