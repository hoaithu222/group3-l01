import { create } from 'zustand';

import type {
  EditorErrorCode,
  PresenceUser,
  SelectionStatePayload,
  StatusPayload,
} from '../webview/doc-editor-bridge.types';

/** Lỗi khiến editor không dùng được — màn hình thay WebView bằng khối trạng thái + "Thử lại"/thoát. */
export interface DocEditorFailure {
  code: EditorErrorCode | 'LOAD_TIMEOUT' | 'TOKEN_FAILED' | 'UNSUPPORTED';
  fatal: boolean;
}

interface DocEditorState {
  failure: DocEditorFailure | null;
  /** Bundle đã gửi `ready` (WebView nạp xong). */
  ready: boolean;
  selection: SelectionStatePayload | null;
  status: StatusPayload | null;
  users: PresenceUser[];
  /** Token đang làm mới không được (mạng/BE) — hiện dòng cảnh báo nhẹ, chưa phải lỗi. */
  tokenProblem: boolean;
}

interface DocEditorActions {
  patch: (next: Partial<DocEditorState>) => void;
  reset: () => void;
}

const INITIAL: DocEditorState = {
  failure: null,
  ready: false,
  selection: null,
  status: null,
  tokenProblem: false,
  users: [],
};

/**
 * Trạng thái của editor ĐANG MỞ (kết nối, đồng bộ, người xem, định dạng tại con trỏ) — không persist, reset khi rời màn
 * (app.md §5). Chỉ có MỘT editor sống tại một thời điểm; màn xem bản lưu (lịch sử) dùng state cục bộ, KHÔNG ghi vào đây (WebView
 * của editor thật vẫn đang mount dưới ngăn xếp điều hướng).
 *
 * ⚠️ Nội dung tài liệu KHÔNG nằm ở đây (nằm trong Y.Doc của WebView) — store chỉ giữ trạng thái để vẽ toolbar/chấm trạng thái.
 * Component đọc BẰNG selector hẹp (`useDocEditorStore((s) => s.status)`) để tin `selectionState` dồn dập không vẽ lại cả màn.
 */
export const useDocEditorStore = create<DocEditorState & DocEditorActions>((set) => ({
  ...INITIAL,
  patch: (next) => set(next),
  reset: () => set(INITIAL),
}));
