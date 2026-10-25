import type * as Y from 'yjs';

import type { WhiteboardTool } from '../../constants/tools';
import type { Camera, Rect, Vec2, WhiteboardElement, WriteContext } from '../../engine';
import type { TextEditTarget, ToolStyle } from '../../store/whiteboard-ui.store';

/**
 * Bản NHÁP đang kéo (chưa ghi vào Y.Doc — ghi MỘT transaction khi nhả tay, README §2): `elements` vẽ trên lớp nháp, `hiddenIds` là bản gốc bị
 * ẩn khỏi cảnh đã ghi (không thì thấy hai bản chồng nhau), `marquee` là khung chọn nhiều, `active` = đang kéo nên ẩn tay nắm chọn.
 */
export interface Draft {
  active: boolean;
  elements: WhiteboardElement[];
  hiddenIds: ReadonlySet<string>;
  marquee: Rect | null;
}

/** Một lượt kéo MỘT ngón (đã qua ngưỡng nhúc nhích). Toạ độ là THẾ GIỚI. `cancel` khi cử chỉ bị ngắt (ngón thứ hai chạm vào). */
export interface DragSession {
  cancel: () => void;
  end: () => void;
  move: (world: Vec2) => void;
}

/**
 * Cầu nối giữa bộ xử lý tương tác (THUẦN TS, test được không cần Skia/RN) và thế giới bên ngoài: Y.Doc, camera, store UI, awareness. Mọi hàm là
 * "đọc lúc gọi" (không chụp giá trị) — cử chỉ chạy lâu hơn một lần render, giá trị chụp sẽ cũ.
 */
export interface InteractionEnv {
  camera: () => Camera;
  doc: Y.Doc;
  elements: () => readonly WhiteboardElement[];
  now: () => number;
  /** Phát vị trí con trỏ lên awareness (`null` = rời) — chỉ máy CÓ QUYỀN VẼ phát. */
  pointer: (world: Vec2 | null) => void;
  reportLimit: () => void;
  requestTextEdit: (target: TextEditTarget) => void;
  selection: () => readonly string[];
  setDraft: (draft: Draft | null) => void;
  setSelection: (ids: string[]) => void;
  setTool: (tool: WhiteboardTool) => void;
  style: () => ToolStyle;
  tool: () => WhiteboardTool;
  write: () => WriteContext;
}

export interface Interaction {
  /** Bắt đầu kéo một ngón tại điểm CHẠM XUỐNG (toạ độ màn); `null` = công cụ này không kéo (chữ/giấy nhớ) — nơi gọi dùng cử chỉ để pan. */
  begin: (screen: Vec2) => DragSession | null;
  longPress: (screen: Vec2) => void;
  tap: (screen: Vec2) => void;
}
