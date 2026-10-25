import {
  BREAKDOWN_GRID_COLUMNS,
  BREAKDOWN_MAX_UNITS_PER_ROW,
  BREAKDOWN_PANELS,
  type BreakdownPanelId,
} from '../constants/breakdown.constants';

export interface BreakdownPanelPlacement {
  id: BreakdownPanelId;
  /** Số cột chiếm ở `xl` (trên 12). */
  xlSpan: number;
  /** `true` = chiếm cả hai cột ở `md` (panel rộng, hoặc panel hẹp lẻ đôi cuối cùng — để hàng cuối không hở một ô). */
  mdFull: boolean;
}

/**
 * Xếp các panel CÓ MẶT (cờ phân hệ tắt thì vắng) vào lưới 12 cột sao cho mỗi hàng kín đúng 12 cột và các hàng đông gần bằng nhau:
 * tổng đơn vị chia đều vào số hàng tối thiểu (≤ 4 đơn vị/hàng) rồi mỗi hàng giãn ra đủ 12 cột. Nhờ đó panel nào vắng thì các panel còn lại
 * rộng ra lấp chỗ, KHÔNG để ô trống. VD đủ 7 panel (8 đơn vị) → `[3 · 6 · 3]` + `[3 · 3 · 3 · 3]`; thiếu XP/cấp độ → `[4 · 8]` + `[4 · 4 · 4]`.
 *
 * `md` (2 cột): panel rộng chiếm cả hàng, nên cần `grid-flow-dense` ở nơi dùng để panel hẹp lấp chỗ trống bên cạnh nó.
 */
export function layoutBreakdownPanels(ids: readonly BreakdownPanelId[]): BreakdownPanelPlacement[] {
  const entries = ids.map((id) => ({ id, units: BREAKDOWN_PANELS[id].units }));
  const totalUnits = entries.reduce((sum, e) => sum + e.units, 0);
  if (totalUnits === 0) return [];

  const rowCount = Math.ceil(totalUnits / BREAKDOWN_MAX_UNITS_PER_ROW);
  const rowLimit = Math.ceil(totalUnits / rowCount);

  const rows: (typeof entries)[] = [];
  let current: typeof entries = [];
  let currentUnits = 0;
  for (const entry of entries) {
    if (current.length > 0 && currentUnits + entry.units > rowLimit) {
      rows.push(current);
      current = [];
      currentUnits = 0;
    }
    current.push(entry);
    currentUnits += entry.units;
  }
  if (current.length > 0) rows.push(current);

  const narrowCount = entries.filter((e) => e.units <= 1).length;
  let narrowSeen = 0;
  return rows.flatMap((row) => {
    const rowUnits = row.reduce((sum, e) => sum + e.units, 0);
    const unitColumns = Math.floor(BREAKDOWN_GRID_COLUMNS / rowUnits);
    // Phần dư (chỉ khi số đơn vị của hàng không chia hết 12) dồn vào panel cuối hàng để hàng vẫn kín.
    const spare = BREAKDOWN_GRID_COLUMNS - unitColumns * rowUnits;
    return row.map((entry, index) => {
      const narrow = entry.units <= 1;
      if (narrow) narrowSeen += 1;
      return {
        id: entry.id,
        xlSpan: entry.units * unitColumns + (index === row.length - 1 ? spare : 0),
        mdFull: !narrow || (narrowCount % 2 === 1 && narrowSeen === narrowCount),
      };
    });
  });
}
