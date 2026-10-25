import type { ModuleUsage, ModuleUsageMap } from '@/shell/navigation/module-usage.store';

/**
 * Số lượt mở TỐI THIỂU để một phân hệ được PHÉP vượt thứ tự khai báo.
 *
 * Không có ngưỡng thì mở nhầm đúng một lần cũng đủ đá một thẻ khỏi hero — người dùng thấy tầng trên cùng đổi mà không
 * hiểu vì sao, đúng kiểu "đổi chỗ không đoán được" làm người ta thôi tin vào vùng thích ứng (Gajos, CHI 2008).
 */
export const MIN_OPENS_TO_PROMOTE = 3;

/** Lượt mở dưới ngưỡng coi như 0 ⇒ giữ nguyên thứ tự khai báo. */
function promotableCount(entry: ModuleUsage | undefined): number {
  const count = entry?.count ?? 0;
  return count >= MIN_OPENS_TO_PROMOTE ? count : 0;
}

/**
 * Mốc mở gần nhất, CHỈ tính khi đã đạt ngưỡng. Nếu tính cả phân hệ dưới ngưỡng thì "mở nhầm một lần, gần đây" vẫn thắng
 * ở bước phá hoà và đá một thẻ khỏi hero — đúng điều ngưỡng sinh ra để chặn.
 */
function promotableLastAt(entry: ModuleUsage | undefined): number {
  return promotableCount(entry) > 0 ? (entry?.lastAt ?? 0) : 0;
}

/**
 * Chọn phân hệ nào lên tầng HERO (`slots` thẻ lớn trên cùng của Trang chủ). Không đụng mảng đầu vào.
 *
 * Ba tầng ưu tiên, đúng thứ tự:
 *  1. **Người dùng GHIM** — giữ nguyên thứ tự ghim, không xếp lại theo bất cứ gì. Đây là cơ chế CHÍNH.
 *  2. **Lượt mở giảm dần** (chỉ tính khi ≥ `MIN_OPENS_TO_PROMOTE`), phá hoà bằng lần mở gần nhất.
 *  3. **Thứ tự khai báo** (`MODULE_REGISTRY`) — chốt cuối để kết quả TẤT ĐỊNH; chưa ghim + chưa có lượt mở nào thì hero
 *     là `slots` phân hệ đầu registry.
 *
 * ── Vì sao KHÔNG để hệ thống tự xếp lại thoải mái ────────────────────────────
 * Findlater & McGrenere (CHI 2004): menu tự đổi chỗ theo tần suất (adaptive) chậm nhất, cố định nhanh nhất, người dùng tự
 * sắp (adaptable = ghim tay) nhanh ngang cố định và được ưa nhất. Nên phần tự động bị siết ba lớp: chỉ điền ô CHƯA ghim,
 * cần vượt ngưỡng lượt mở, và bảng lượt mở truyền vào phải là ảnh chụp ĐÓNG BĂNG theo phiên (`module-usage.store`).
 *
 * @param modules Phân hệ người dùng được vào, theo thứ tự khai báo.
 * @param pinned `id` đã ghim theo thứ tự ghim. Ghim của phân hệ không còn trong `modules` bị bỏ qua (mất quyền / tắt
 *   cờ) — không được chiếm ô hero.
 * @param usage Bảng lượt mở đã đóng băng. `{}` = chưa có dữ liệu ⇒ rơi về thứ tự khai báo.
 */
export function pickHeroModules<T extends { id: string }>(
  modules: readonly T[],
  pinned: readonly string[],
  usage: ModuleUsageMap,
  slots: number,
): T[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const pins = pinned
    .map((id) => byId.get(id))
    .filter((module): module is T => module !== undefined)
    .slice(0, slots);
  if (pins.length >= slots) return pins;

  const pinnedIds = new Set(pins.map((module) => module.id));
  const rest = modules
    .map((module, index) => ({ index, module }))
    .filter((entry) => !pinnedIds.has(entry.module.id))
    .sort((a, b) => {
      const countDelta = promotableCount(usage[b.module.id]) - promotableCount(usage[a.module.id]);
      if (countDelta !== 0) return countDelta;
      const lastDelta = promotableLastAt(usage[b.module.id]) - promotableLastAt(usage[a.module.id]);
      if (lastDelta !== 0) return lastDelta;
      return a.index - b.index;
    })
    .map((entry) => entry.module);

  return [...pins, ...rest].slice(0, slots);
}

export interface HomeModuleSplit<T> {
  /** Tầng 1: thẻ lớn. Rỗng khi có ít phân hệ hơn `minModules`. */
  heroes: T[];
  /** Tầng 2: lưới — phần còn lại, GIỮ thứ tự khai báo (không xếp lại theo lượt mở để trí nhớ vị trí còn dùng được). */
  rest: T[];
}

/**
 * Tách danh sách phân hệ thành hero + lưới — MỘT mục = MỘT chỗ: phân hệ đã lên hero thì BỊ LOẠI khỏi lưới (hiện cả hai
 * nơi là nhiễu, và ô "ghim" sẽ trông như chưa làm gì).
 *
 * Ít hơn `minModules` thì KHÔNG tách tầng: 2 thẻ lớn + 1 ô lẻ nằm chơ vơ trông tệ hơn hẳn một lưới đều nhau.
 */
export function splitHomeModules<T extends { id: string }>(
  modules: readonly T[],
  pinned: readonly string[],
  usage: ModuleUsageMap,
  options: { minModules: number; slots: number },
): HomeModuleSplit<T> {
  if (modules.length < options.minModules) return { heroes: [], rest: [...modules] };
  const heroes = pickHeroModules(modules, pinned, usage, options.slots);
  const heroIds = new Set(heroes.map((module) => module.id));
  return { heroes, rest: modules.filter((module) => !heroIds.has(module.id)) };
}
