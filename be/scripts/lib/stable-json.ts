/**
 * `JSON.stringify` với KHOÁ ĐỐI TƯỢNG SẮP XẾP đệ quy (thứ tự PHẦN TỬ MẢNG giữ
 * nguyên — chỉ khoá object bị sort) — hai lần sinh cho cùng nội dung luôn ra
 * byte giống hệt (README p0-09 CTR-08: `openapi.json`/`contracts/*.json` diff
 * = 0 khi không đổi gì thật). 2 dấu cách thụt lề; caller tự thêm `\n` cuối file.
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortDeep(input[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}
