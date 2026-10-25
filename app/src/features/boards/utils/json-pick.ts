/**
 * Đọc MỀM giá trị trong JSON tuỳ loại (`TaskActivity.before/after`) mà be.md chưa đặc tả — xem `activity-text.ts`.
 */
export type Json = Record<string, unknown> | null;

/** Đọc chuỗi ở khoá đầu tiên có giá trị chuỗi không rỗng. */
export function pickText(source: Json, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

export function pickNumber(source: Json, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}
