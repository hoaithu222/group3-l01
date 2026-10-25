/**
 * Bổ sung vài API ES2022 mà thư viện (Tiptap/ProseMirror) gọi trong đường chạy chính nhưng WebView cũ chưa có
 * (`Array#findLast` gọi ở MỖI giao dịch — thiếu là editor hỏng hẳn): Chromium < 97 / iOS < 15.4. Bản tối thiểu, chỉ thêm khi thiếu.
 * Import ĐẦU TIÊN ở `main.ts`.
 */
type Fn = (this: never, ...args: never[]) => unknown;

function define(target: object, name: string, value: Fn): void {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
}

define(Array.prototype, "at", function (this: unknown[], index: number) {
  const n = Math.trunc(index) || 0;
  return this[n < 0 ? this.length + n : n];
} as Fn);

define(Array.prototype, "findLast", function (this: unknown[], predicate: (v: unknown, i: number, a: unknown[]) => boolean, thisArg?: unknown) {
  for (let i = this.length - 1; i >= 0; i -= 1) if (predicate.call(thisArg, this[i], i, this)) return this[i];
  return undefined;
} as Fn);

define(Array.prototype, "findLastIndex", function (this: unknown[], predicate: (v: unknown, i: number, a: unknown[]) => boolean, thisArg?: unknown) {
  for (let i = this.length - 1; i >= 0; i -= 1) if (predicate.call(thisArg, this[i], i, this)) return i;
  return -1;
} as Fn);

define(String.prototype, "replaceAll", function (this: string, search: string | RegExp, replacement: string) {
  if (search instanceof RegExp) {
    if (!search.global) throw new TypeError("replaceAll must be called with a global RegExp");
    return this.replace(search, replacement);
  }
  return this.split(String(search)).join(String(replacement));
} as Fn);
