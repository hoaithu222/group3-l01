export type ZMode = 'back' | 'backward' | 'forward' | 'front';

/** "Rút phần tử ở `from`, rồi chèn vào chỉ số `to` (tính SAU khi rút)" — khớp `Y.Array.delete` rồi `insert`. */
export interface ZMove {
  from: number;
  to: number;
}

/**
 * Danh sách bước di chuyển để đổi thứ tự z của các id đã chọn. Hàm THUẦN (test không cần Y.Doc); adapter áp
 * từng bước lên `Y.Array` theo đúng thứ tự.
 *
 * Vì sao là danh sách bước chứ không phải "mảng thứ tự mới": ghi đè cả mảng (xoá hết + chèn lại) làm hai máy
 * cùng đổi thứ tự một lúc nhân đôi mọi id. Bước rút/chèn từng phần tử chỉ đụng đúng phần tử cần đổi
 * (README §10: "đưa lên trên = xoá + chèn cuối trong một transaction").
 *
 *  · `front`/`back`: cả nhóm lên trên cùng / xuống dưới cùng, GIỮ thứ tự tương đối trong nhóm.
 *  · `forward`/`backward`: mỗi phần tử nhảy qua MỘT phần tử không được chọn kề nó.
 * Đã ở đúng vị trí thì trả `[]` (không sinh bản cập nhật rỗng).
 */
export function zOrderMoves(
  order: readonly string[],
  selected: ReadonlySet<string>,
  mode: ZMode,
): ZMove[] {
  const picked = order.filter((id) => selected.has(id));
  const k = picked.length;
  if (k === 0) return [];
  const work = [...order];
  const moves: ZMove[] = [];
  const move = (from: number, to: number): void => {
    if (from === to) return;
    const [id] = work.splice(from, 1);
    if (id === undefined) return;
    work.splice(to, 0, id);
    moves.push({ from, to });
  };

  if (mode === 'front') {
    if (order.slice(order.length - k).every((id) => selected.has(id))) return [];
    for (const id of picked) move(work.indexOf(id), work.length - 1);
  } else if (mode === 'back') {
    if (order.slice(0, k).every((id) => selected.has(id))) return [];
    for (const id of [...picked].reverse()) move(work.indexOf(id), 0);
  } else if (mode === 'forward') {
    for (let i = work.length - 2; i >= 0; i--) {
      if (selected.has(work[i] ?? '') && !selected.has(work[i + 1] ?? '')) move(i, i + 1);
    }
  } else {
    for (let i = 1; i < work.length; i++) {
      if (selected.has(work[i] ?? '') && !selected.has(work[i - 1] ?? '')) move(i, i - 1);
    }
  }
  return moves;
}
