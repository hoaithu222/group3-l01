import type { QueryClient } from '@tanstack/react-query';

import { boardKeys } from '../queries/boards.keys';
import { taskKeys } from '../queries/task-detail.keys';

/**
 * Dữ liệu SUY RA từ thẻ của một bảng, nằm NGOÀI cache thẻ (`tasksAll`) nên các hàm vá thẻ (`task-cache.ts`) không chạm tới:
 *
 *  · danh sách bảng — "N cột · M thẻ", "x% hoàn thành" (màn danh sách nằm DƯỚI Kanban, vẫn mounted ⇒ quay lại vẫn số cũ);
 *  · Gantt — tên/người nhận/trạng thái/thanh đã xoá (modal thẻ mở ĐÈ lên Gantt, Gantt vẫn mounted);
 *  · báo cáo đóng góp — điểm/thẻ theo thành viên, heatmap. Khoá của `contribution` (`contribution.keys.ts`, hàm `board()`) —
 *    ghi tay vì không được import chéo feature;
 *  · kỹ năng của tôi (khoá của `career`, `career.keys.ts` `skills()`): tiến độ "x/y thẻ" tính từ thẻ đã xong có nhãn kỹ năng.
 *
 * Chỉ query ĐANG hiện mới tải lại ngay; còn lại bị đánh dấu cũ và tải khi mở.
 */
export function invalidateBoardDerived(queryClient: QueryClient, boardId: string): void {
  invalidateRemoteBoardDerived(queryClient, boardId);
  void queryClient.invalidateQueries({ queryKey: ['career', 'skills'] });
}

/** Như `invalidateBoardDerived` nhưng cho thay đổi của NGƯỜI KHÁC (socket) — kỹ năng CỦA MÌNH không đổi theo thẻ của họ. */
export function invalidateRemoteBoardDerived(queryClient: QueryClient, boardId: string): void {
  void queryClient.invalidateQueries({ queryKey: [...boardKeys.all, 'list'] });
  void queryClient.invalidateQueries({ queryKey: boardKeys.ganttAll(boardId) });
  void queryClient.invalidateQueries({ queryKey: ['contribution', 'board', boardId] });
  // Heatmap CẤP NHÓM gộp mọi bảng (p4-06, `contributionKeys.workspaceHeatmapAll`) — không biết nhóm nào nên dọn cả tiền tố; chỉ query đang hiện mới tải lại ngay.
  void queryClient.invalidateQueries({ queryKey: ['contribution', 'workspace-heatmap'] });
}

/**
 * Thẻ đổi CỘT ở Kanban (kéo thả) ⇒ chi tiết thẻ đang cache giữ cột/trạng thái/`version` CŨ: mở lại trong `staleTime` thấy cột
 * cũ, và sửa tiếp gửi `expectedVersion` cũ ⇒ 409. Nhật ký của thẻ cũng có dòng mới.
 */
export function invalidateTaskDetail(queryClient: QueryClient, taskId: string): void {
  void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
  void queryClient.invalidateQueries({ queryKey: taskKeys.activity(taskId) });
}
