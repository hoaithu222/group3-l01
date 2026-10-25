/**
 * Điều hướng focus giữa các ô nhập bằng phím mũi tên (kiểu Excel).
 *
 * Tách khỏi hook vì toàn bộ là hàm thuần — chỉ đọc DOM (toạ độ ô + vị trí con
 * trỏ), không dính React, test riêng được (xem `clean-code-standards.md §4`).
 *
 * Luật chọn ô đích dựa trên TOẠ ĐỘ THẬT trên màn hình, không dựa vào thứ tự
 * khai báo. Nhờ vậy form xếp dọc (thẻ nhóm vật tư) và form xếp ngang (dòng
 * bảng đơn vị đo) dùng chung một luật: ↓ tìm ô nằm dưới, → tìm ô nằm bên phải.
 */

/** Hướng di chuyển suy ra từ phím mũi tên. */
export type FieldNavDirection = 'up' | 'down' | 'left' | 'right';

const ARROW_DIRECTION: Record<string, FieldNavDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** `null` nếu phím không phải mũi tên. */
export const arrowDirection = (key: string): FieldNavDirection | null =>
  ARROW_DIRECTION[key] ?? null;

/**
 * Ô tham gia điều hướng = ô CHỨA DỮ LIỆU.
 *
 * Cố tình KHÔNG lấy `<button>` thường (nút ✓/✕, nút xoá, nút chọn ký tự đặc
 * biệt) — chúng vẫn tới được bằng Tab; mũi tên chỉ chạy giữa các ô nhập liệu.
 * Checkbox/radio cũng loại: kit2 render chúng thành `<button role="checkbox">`
 * nên không lọt vào selector này, và tick chọn dòng không phải dữ liệu của form.
 */
const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  'textarea',
  '[role="combobox"]',
].join(',');

type TextField = HTMLInputElement | HTMLTextAreaElement;

const isTextField = (el: HTMLElement): el is TextField =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

/** Phần tử này có phải một ô nhập điều hướng được không? */
export const isNavField = (el: HTMLElement): boolean => el.matches(FIELD_SELECTOR);

/**
 * Vị trí con trỏ. Trả `null` với input không hỗ trợ chọn (`number`, `email`…):
 * đọc/ghi `selectionStart` ở các type đó ném lỗi trên một số trình duyệt.
 */
const caretOf = (el: TextField): { start: number; end: number } | null => {
  try {
    const { selectionStart: start, selectionEnd: end } = el;
    return start === null || end === null ? null : { start, end };
  } catch {
    return null;
  }
};

const setCaret = (el: TextField, position: number): void => {
  try {
    el.setSelectionRange(position, position);
  } catch {
    /* input type không hỗ trợ chọn — bỏ qua, focus là đủ. */
  }
};

/**
 * Mũi tên có được phép RỜI ô hiện tại không?
 *
 * - Ô chữ: ←/→ chỉ rời khi con trỏ đã ở sát đầu/cuối và không bôi đen, nên vẫn
 *   sửa được chữ giữa dòng như bình thường. ↑/↓ rời ngay vì input một dòng
 *   không có dòng trên/dưới để đi; riêng `<textarea>` phải đang ở dòng đầu/cuối.
 * - Dropdown đang mở danh sách (`aria-expanded="true"`): KHÔNG rời — nhường
 *   mũi tên cho việc chọn option.
 */
export function canLeaveField(el: HTMLElement, direction: FieldNavDirection): boolean {
  if (el.getAttribute('aria-expanded') === 'true') return false;
  if (!isTextField(el)) return true;

  const caret = caretOf(el);
  if (!caret) return true;
  if (caret.start !== caret.end) return false; // đang bôi đen → nhường phím cho native

  if (direction === 'left') return caret.start === 0;
  if (direction === 'right') return caret.start === el.value.length;

  if (el instanceof HTMLTextAreaElement) {
    return direction === 'up'
      ? !el.value.slice(0, caret.start).includes('\n')
      : !el.value.slice(caret.start).includes('\n');
  }
  return true;
}

const isDisabled = (el: HTMLElement): boolean =>
  el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

/** Các ô nhập đang hiển thị và thao tác được bên trong `scope`. */
export function collectNavFields(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter((el) => {
    if (isDisabled(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/** Sai số khi so mép (px) — chống lệch 1–2px do border/padding của cell. */
const AXIS_TOLERANCE = 4;
/** Phạt lệch trục phụ để ưu tiên ô thẳng hàng với ô đang đứng. */
const CROSS_AXIS_PENALTY = 2;

const centerOf = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/**
 * Ô gần nhất theo ĐÚNG hướng vừa nhấn. Không có ô nào nằm về phía đó → `null`,
 * caller trả phím lại cho trình duyệt (vd ↓ ở ô cuối thẻ sẽ mở dropdown).
 */
export function findFieldInDirection(
  fields: HTMLElement[],
  current: HTMLElement,
  direction: FieldNavDirection,
): HTMLElement | null {
  const from = centerOf(current);
  const vertical = direction === 'up' || direction === 'down';
  const forward = direction === 'down' || direction === 'right' ? 1 : -1;

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const field of fields) {
    if (field === current) continue;
    const to = centerOf(field);
    const main = (vertical ? to.y - from.y : to.x - from.x) * forward;
    if (main <= AXIS_TOLERANCE) continue; // không nằm về phía đang nhấn
    const cross = Math.abs(vertical ? to.x - from.x : to.y - from.y);
    const score = main + cross * CROSS_AXIS_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      best = field;
    }
  }
  return best;
}

/**
 * Chuyển focus sang ô đích. Con trỏ vào ở mép ĐỐI DIỆN hướng đi (đi phải/xuống
 * thì vào đầu ô, đi trái/lên thì vào cuối ô) để mạch gõ chạy liên tục và lần
 * nhấn kế tiếp không lập tức bật ngược trở lại ô cũ.
 */
export function focusField(el: HTMLElement, direction: FieldNavDirection): void {
  el.focus();
  if (!isTextField(el)) return;
  setCaret(el, direction === 'right' || direction === 'down' ? 0 : el.value.length);
}
