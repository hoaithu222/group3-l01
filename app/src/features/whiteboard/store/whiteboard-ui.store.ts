import { create } from 'zustand';

import { STROKE_WIDTHS } from '../constants/palette';
import type { WhiteboardTool } from '../constants/tools';
import type { Vec2 } from '../engine';

/** Kiểu vẽ đang chọn: màu nét (id token), màu tô (id token hoặc `null` = không tô), bề dày, cỡ chữ. */
export interface ToolStyle {
  fill: string | null;
  fontSize: number;
  stroke: string;
  width: number;
}

export const DEFAULT_STYLE: ToolStyle = {
  fill: null,
  fontSize: 20,
  stroke: 'ink',
  width: STROKE_WIDTHS[0] ?? 2,
};

/** Đích của tấm soạn chữ: tạo mới ở một điểm THẾ GIỚI (chưa ghi gì vào Y.Doc cho tới khi bấm Xong) hoặc sửa phần tử có sẵn. */
export type TextEditTarget =
  { at: Vec2; mode: 'create'; type: 'sticky' | 'text' } | { id: string; mode: 'edit' };

interface WhiteboardUiState {
  /** Đã chạm trần phần tử (engine trả `'limit'`) — banner "Bảng đã đầy" + khoá công cụ tạo mới. */
  limitReached: boolean;
  selection: string[];
  style: ToolStyle;
  textEdit: TextEditTarget | null;
  tool: WhiteboardTool;
}

interface WhiteboardUiActions {
  clearSelection: () => void;
  reset: () => void;
  setLimitReached: (value: boolean) => void;
  setSelection: (ids: string[]) => void;
  setStyle: (patch: Partial<ToolStyle>) => void;
  setTextEdit: (target: TextEditTarget | null) => void;
  setTool: (tool: WhiteboardTool) => void;
}

const INITIAL: WhiteboardUiState = {
  limitReached: false,
  selection: [],
  style: DEFAULT_STYLE,
  textEdit: null,
  tool: 'select',
};

/**
 * Trạng thái UI của MỘT phiên vẽ (công cụ, kiểu vẽ, vùng chọn, tấm soạn chữ) — không persist, reset khi rời màn (app.md §5). Chỉ có MỘT bảng
 * mở tại một thời điểm. ⚠️ Camera KHÔNG ở đây: nó đổi 60 lần/giây khi pan/zoom nên nằm trong shared value của Reanimated
 * (`useWhiteboardCamera`); để trong zustand là vẽ lại cả cây mỗi frame. Kiểu vẽ gần nhất lưu theo người dùng ở `whiteboard-prefs.ts`.
 *
 * Component đọc BẰNG selector hẹp (`useWhiteboardUiStore((s) => s.tool)`) để đổi vùng chọn không vẽ lại thanh công cụ.
 */
export const useWhiteboardUiStore = create<WhiteboardUiState & WhiteboardUiActions>((set) => ({
  ...INITIAL,
  clearSelection: () => set((state) => (state.selection.length === 0 ? state : { selection: [] })),
  reset: () => set(INITIAL),
  setLimitReached: (value) => set({ limitReached: value }),
  setSelection: (ids) => set({ selection: ids }),
  setStyle: (patch) => set((state) => ({ style: { ...state.style, ...patch } })),
  setTextEdit: (target) => set({ textEdit: target }),
  setTool: (tool) => set({ tool }),
}));
