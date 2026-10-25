import { COMMON_STRINGS } from '@/shared/strings/common';

import { logger } from './logger';

/**
 * Chuỗi giao diện — hạ tầng MỎNG, không phụ thuộc thư viện (p0-12 README §2 "Chuỗi").
 *
 * ── Vì sao không dùng i18next ngay ───────────────────────────────────────────
 * Sản phẩm chỉ có tiếng Việt (mặc định KHÔNG có tiếng Anh trước Phase 3). Thêm thư viện + provider + bước nạp
 * ngôn ngữ chỉ để tra một bảng tiếng Việt là chi phí không đổi lấy gì. Nhưng chuỗi KHÔNG được rải khắp component
 * (Sun PMS có ~800 dòng hard-code) — nên cấu trúc ở đây đã là cấu trúc của i18next: khoá `khu-vực.tên` phân cấp,
 * tham số `{tên}`, số nhiều theo `count`. Đổi sang i18next sau này là đổi thân `translate`, không đổi nơi gọi.
 *
 * ── Hai cách dùng ────────────────────────────────────────────────────────────
 *  · Chuỗi CHUNG: `t('common.state.error.title')` — không gian tên `common` (`shared/strings/common.ts`) đăng ký sẵn.
 *  · Chuỗi của MỘT feature: `const tx = createTranslator(CHAT_STRINGS)` — khoá được KIỂM KIỂU (gõ sai là `tsc`
 *    đỏ), không đụng trạng thái toàn cục. Ưu tiên cách này cho mã mới.
 *
 * ── Số nhiều ─────────────────────────────────────────────────────────────────
 * Nút lá có thể là `{ zero?, one?, other }` (`other` bắt buộc) — chọn theo tham số `count`. Tiếng Việt không chia
 * số ít/nhiều, nên thường chỉ cần `zero` ("Không có tin nhắn") và `other`.
 * ⚠️ Vì vậy khoá `other` bị RESERVED: một nhánh có con tên `other` kiểu chuỗi được coi là nút số nhiều.
 *
 * ⛔ Không nối chuỗi tay quanh `t(…)` ("Xin chào " + t(…)): ngôn ngữ khác đổi thứ tự từ. Đưa cả câu vào một
 * chuỗi có tham số.
 */

export type TranslateParams = Readonly<Record<string, number | string>>;

export interface PluralForms {
  readonly zero?: string;
  readonly one?: string;
  readonly other: string;
}

export interface StringTree {
  readonly [key: string]: PluralForms | StringTree | string;
}

/** Mọi khoá lá của một cây chuỗi, dạng `a.b.c` — để `createTranslator` kiểm kiểu tên khoá. */
export type StringKey<T> = T extends string | PluralForms
  ? never
  : {
      [K in keyof T & string]: T[K] extends string | PluralForms ? K : `${K}.${StringKey<T[K]>}`;
    }[keyof T & string];

function isPlural(node: unknown): node is PluralForms {
  return (
    typeof node === 'object' && node !== null && typeof (node as PluralForms).other === 'string'
  );
}

/** Chọn dạng số nhiều theo `count`. `zero`/`one` thiếu thì rơi về `other`. */
export function pluralize(forms: PluralForms, count: number): string {
  if (count === 0 && forms.zero !== undefined) return forms.zero;
  if (count === 1 && forms.one !== undefined) return forms.one;
  return forms.other;
}

/** Thế `{tên}` bằng tham số. Tham số thiếu thì GIỮ NGUYÊN `{tên}` — thấy được ngay là quên truyền, thay vì chuỗi cụt. */
export function formatString(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

function lookup(tree: StringTree, key: string): PluralForms | string | undefined {
  let node: PluralForms | StringTree | string | undefined = tree;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || isPlural(node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined;
}

function translate(tree: StringTree, key: string, params?: TranslateParams): string | undefined {
  const node = lookup(tree, key);
  if (node === undefined) return undefined;
  if (typeof node === 'string') return formatString(node, params);
  const count = typeof params?.count === 'number' ? params.count : Number(params?.count);
  return formatString(pluralize(node, Number.isFinite(count) ? count : NaN), params);
}

/** Bộ dịch có KIỂM KIỂU khoá, gắn với MỘT cây chuỗi (thường là `strings.ts` của feature). */
export function createTranslator<T extends StringTree>(
  tree: T,
): (key: StringKey<T>, params?: TranslateParams) => string {
  return (key, params) => translate(tree, key, params) ?? key;
}

const namespaces = new Map<string, StringTree>([['common', COMMON_STRINGS]]);
const warnedMissing = new Set<string>();

/** Đăng ký một không gian tên cho `t()` — `t('<namespace>.<khoá>')`. Đăng ký lại cùng tên là thay thế. */
export function registerStrings(namespace: string, tree: StringTree): void {
  namespaces.set(namespace, tree);
}

/**
 * Tra chuỗi theo khoá đầy đủ `<không-gian-tên>.<khoá>`. Khoá thiếu ⇒ trả CHÍNH KHOÁ (lộ ra ngay trên màn thay vì
 * ô trống) và cảnh báo một lần ở dev.
 */
export function t(key: string, params?: TranslateParams): string {
  const dot = key.indexOf('.');
  const tree = dot > 0 ? namespaces.get(key.slice(0, dot)) : undefined;
  const text = tree ? translate(tree, key.slice(dot + 1), params) : undefined;
  if (text !== undefined) return text;

  if (__DEV__ && !warnedMissing.has(key)) {
    warnedMissing.add(key);
    logger.warn(`[i18n] thiếu chuỗi "${key}"`);
  }
  return key;
}

/** `t` gắn cứng vào chuỗi CHUNG, khoá được kiểm kiểu — dùng trong `shared/ui` và hook dùng chung. */
export const tCommon = createTranslator(COMMON_STRINGS);
