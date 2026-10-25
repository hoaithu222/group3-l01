/**
 * Mặt tiền công khai của feature Bảng trắng (p6-02) — route trong `app/(app)/workspaces/[wsId]/whiteboards/**` trỏ vào các màn này. Lối vào ở hub nhóm
 * (`features/workspaces/hooks/useWorkspaceHubEntries.ts`) đi bằng ĐƯỜNG DẪN (không import feature này — `feature-structure.md`).
 * Thư mục `engine/` (thuần TS, không import React/RN/Skia) KHÔNG xuất ở đây — import trực tiếp `@/features/whiteboard/engine` khi cần.
 */
export { WhiteboardListScreen } from './screens/WhiteboardListScreen';
export { WhiteboardCanvasScreen } from './screens/WhiteboardCanvasScreen';
export { WhiteboardHistoryScreen } from './screens/WhiteboardHistoryScreen';
export { WhiteboardShareScreen } from './screens/WhiteboardShareScreen';
