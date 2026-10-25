/** Chia phần trăm cả nhóm — HÀM THUẦN, tách khỏi bộ tính để test riêng (thuộc tính: tổng luôn đúng 100,0). */
/** Chia phần trăm theo PHẦN DƯ LỚN NHẤT trên số nguyên (đơn vị 0,1): tổng đúng 1000 (= 100,0). Điểm đều 0 → mọi người 0. */
export function allocateShares(scoresTenths: ReadonlyMap<string, number>): Map<string, number> {
  const total = [...scoresTenths.values()].reduce((a, b) => a + b, 0);
  const result = new Map<string, number>();
  if (total <= 0) {
    for (const id of scoresTenths.keys()) result.set(id, 0);
    return result;
  }
  const rows = [...scoresTenths].map(([id, s]) => ({ id, floor: Math.floor((s * 1000) / total), rem: (s * 1000) % total }));
  const missing = 1000 - rows.reduce((a, r) => a + r.floor, 0);
  [...rows]
    .sort((a, b) => b.rem - a.rem || (a.id < b.id ? -1 : 1))
    .slice(0, missing)
    .forEach((r) => {
      r.floor += 1;
    });
  for (const r of rows) result.set(r.id, r.floor / 10);
  return result;
}
