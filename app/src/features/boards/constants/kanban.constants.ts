import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { ColumnKind, ColumnInput } from '../api/boards.types';

/**
 * ── Kéo thả: công tắc theo kết quả spike thiết bị ─────────────────────────────
 * ⚠️ CHƯA ĐO trên thiết bị (README p3-02 §9 việc #0, `app.md` §6). Ba mức:
 *  · `'full'`          — kéo TRONG cột và GIỮA cột (điện thoại: tự lật cột ở mép).
 *  · `'within-column'` — chỉ kéo trong cột; đổi cột bằng `MoveTaskSheet`.
 *  · `'off'`           — không kéo; mọi thao tác qua `MoveTaskSheet`.
 * Nếu spike không đạt trên điện thoại thì đổi `phone` thành `'within-column'`
 * (README §10) — KHÔNG cần sửa chỗ nào khác. `MoveTaskSheet` luôn có, bất kể
 * mức nào (a11y + người dùng một tay, `app.md` §7).
 */
export type DragMode = 'full' | 'off' | 'within-column';

export const DRAG_MODE: { phone: DragMode; tablet: DragMode } = {
  phone: 'full',
  tablet: 'full',
};

/** Nhấn giữ bao lâu thì nâng thẻ (`app.md` §2 `DraggableCard`). */
export const LONG_PRESS_MS = 250;

/** Điện thoại: mỗi cột chiếm 88 % bề rộng để lộ mép cột kế bên (gợi ý vuốt được). */
export const PHONE_PAGE_WIDTH_RATIO = 0.88;

/** Tablet: cột hẹp nhất còn đọc được; số cột hiển thị = bề rộng / cột này (3–4 cột). */
export const TABLET_MIN_COLUMN_WIDTH = 260;

export const COLUMN_GAP = 12;

/** Vùng mép (dp) mà thẻ kéo tới thì tự cuộn/tự lật cột. */
export const AUTO_SCROLL_EDGE = 56;

/** Tốc độ cuộn tối đa khi thẻ sát mép (dp mỗi nhịp ~16 ms). */
export const AUTO_SCROLL_MAX_STEP = 14;

/**
 * Ngón tay phải dịch VỀ PHÍA một mép ít nhất chừng này (dp) kể từ lúc nhấc thẻ thì mép đó mới tự cuộn (`armedStep`). Thiếu nó thì thẻ
 * nằm SẴN trong vùng mép — điện thoại: mép trái thẻ ở x = 24 dp, vùng mép rộng `AUTO_SCROLL_EDGE` = 56 — vừa nhấc là pager tự trôi.
 */
export const AUTO_SCROLL_ARM_DISTANCE = 16;

export const COLUMN_KIND_LABEL: Record<ColumnKind, string> = {
  DONE: 'Hoàn thành',
  IN_PROGRESS: 'Đang làm',
  REVIEW: 'Chờ duyệt',
  TODO: 'Cần làm',
};

export const COLUMN_KINDS: readonly ColumnKind[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

/**
 * Ô icon theo LOẠI cột (đầu cột Kanban, cột trống, hàng sửa cột) — mắt nhận ra "cột đang làm"/"cột xong" trước khi đọc tên
 * (tên cột do người dùng đặt, có thể là bất cứ gì). ⚠️ Trang trí: loại cột vẫn có CHỮ (`COLUMN_KIND_LABEL`) trong nhãn trợ
 * năng. ⛔ Không tông `danger` (để dành cho hành động phá huỷ).
 */
export const COLUMN_KIND_ART: Record<ColumnKind, { icon: IconName; tone: IconTileTone }> = {
  DONE: { icon: 'checkmark-circle', tone: 'success' },
  IN_PROGRESS: { icon: 'timer', tone: 'info' },
  REVIEW: { icon: 'view', tone: 'warning' },
  TODO: { icon: 'checkmark-square', tone: 'brand' },
};

/** Khớp `pm.defaultColumns` mặc định của BE (README §7) — chỉ dùng làm điểm xuất phát cho "Tuỳ chỉnh". */
export const DEFAULT_COLUMN_TEMPLATE: readonly ColumnInput[] = [
  { kind: 'TODO', title: 'Cần làm' },
  { kind: 'IN_PROGRESS', title: 'Đang làm' },
  { kind: 'REVIEW', title: 'Chờ duyệt' },
  { kind: 'DONE', title: 'Hoàn thành' },
];

/** Giới hạn cứng phía BE (`LIMITS.board`, README §7) — dùng khi `capabilities.limits` chưa có. */
export const FALLBACK_BOARD_LIMITS = {
  columnTitleMax: 40,
  columnsMax: 12,
  labelsMax: 50,
  nameMax: 80,
} as const;

/**
 * Khoá token màu nhãn → class chấm màu. Danh sách khớp `LABEL_COLOR_TOKENS` của BE
 * (`be/src/core/constants/project.ts`): gray · red · orange · yellow · green · teal ·
 * blue · purple · pink — thêm/bớt token là PR chung be + app + admin.
 *
 * ⛔ Class phải là CHUỖI TĨNH: NativeWind quét mã nguồn để sinh CSS, ghép động
 * (`bg-action-${color}`) không sinh class nào (skill `ui-component` mục 1). Nền
 * `action-*` là màu ĐẶC, đổi đúng theo sáng/tối.
 *
 * ⚠️ Bảng màu hiện KHÔNG có teal và hồng riêng: `teal` mượn tông `action-info`, `pink`
 * mượn `primary-4` (tím nhạt). Chấm luôn đi cùng TÊN màu/nhãn nên không nhầm; nếu
 * thiết kế cần đúng màu thì thêm token vào `colors.json` rồi sửa bảng này. `gray` dùng
 * `fg-2` chứ không `action-grey` (#EEEEEE — gần như vô hình trên thẻ trắng).
 * Token lạ (BE thêm mà app chưa biết) rơi về xám thay vì mất chấm.
 */
export const LABEL_COLOR_CLASS: Record<string, string> = {
  blue: 'bg-action-info',
  gray: 'bg-fg-2',
  green: 'bg-action-success',
  orange: 'bg-action-warning',
  pink: 'bg-primary-4',
  purple: 'bg-action-base',
  red: 'bg-action-error',
  teal: 'bg-action-info',
  yellow: 'bg-action-accent',
};

/** Thứ tự hiển thị trong bộ chọn màu — đúng thứ tự của BE. */
export const LABEL_COLOR_TOKENS: readonly string[] = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
];

export const LABEL_COLOR_FALLBACK_CLASS = 'bg-fg-2';

export const LABEL_COLOR_NAME: Record<string, string> = {
  blue: 'Xanh dương',
  gray: 'Xám',
  green: 'Xanh lá',
  orange: 'Cam',
  pink: 'Hồng',
  purple: 'Tím',
  red: 'Đỏ',
  teal: 'Xanh ngọc',
  yellow: 'Vàng',
};
