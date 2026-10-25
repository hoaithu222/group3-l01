import type { SharedValue } from 'react-native-reanimated';

import type { TaskCardDto } from '../../../api/boards.types';
import type { ColumnBox, Point } from './drop-target';

/** Cách một cột cho DragProvider đo và cuộn nó — đăng ký khi cột mount. */
export interface ColumnHandle {
  /** Hộp cột (toạ độ cửa sổ) + hộp từng thẻ + vị trí cuộn HIỆN TẠI; `null` nếu chưa đo được. */
  measure: () => Promise<ColumnBox | null>;
  /** Cuộn list của cột `dy` dp (âm = lên). */
  scrollBy: (dy: number) => void;
}

/** Vùng cuộn ngang chứa các cột (pager điện thoại / dải cột của tablet). */
export interface PagerHandle {
  getOffsetX: () => number;
  scrollBy: (dx: number) => void;
  /**
   * Về trang (cột) gần nhất — gọi khi kéo xong. Tự cuộn trong lúc kéo dừng ở độ lệch BẤT KỲ (`scrollTo` không kích hoạt
   * `snapToInterval`), nên thiếu bước này bảng nằm lơ giữa hai cột tới lần vuốt kế tiếp. Tablet (không snap): không làm gì.
   */
  settle: () => void;
}

/** Thẻ đang được nâng — React state, chỉ đổi khi bắt đầu/kết thúc kéo (không đổi mỗi khung hình). */
export interface DragSession {
  fromColumnId: string;
  height: number;
  task: TaskCardDto;
  width: number;
}

/**
 * Giá trị chạy trên luồng UI. `x/y` = vị trí ngón tay (toạ độ cửa sổ);
 * `originX/Y` = gốc của DragProvider trong cửa sổ; `grabX/Y` = ngón tay cách góc
 * trên-trái của thẻ bao nhiêu (để thẻ không nhảy về góc khi nâng).
 */
export interface DragShared {
  grabX: SharedValue<number>;
  grabY: SharedValue<number>;
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  visible: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
}

export interface DragContextValue {
  /** Được phép kéo (đúng chế độ, có quyền, đang online). */
  enabled: boolean;
  /**
   * Cột đang nằm dưới ngón tay (cập nhật theo nhịp tự cuộn, chỉ khi ĐỔI cột) — cho gợi ý vùng thả, vd "Cần duyệt trước" khi lướt qua
   * cột Hoàn thành (p4-05). Tuỳ chọn: ngữ cảnh dựng tay trong test không cần khai.
   */
  hoverColumnId?: string | null;
  session: DragSession | null;
  shared: DragShared;
  /** Nâng thẻ; hộp của thẻ do provider tự suy từ `ColumnHandle.measure()` (không cần đo từng thẻ). */
  begin: (task: TaskCardDto, fromColumnId: string, point: Point) => void;
  cancel: () => void;
  end: (point: Point) => void;
  moved: (point: Point) => void;
  registerColumn: (columnId: string, handle: ColumnHandle) => () => void;
  registerPager: (handle: PagerHandle | null) => void;
}
