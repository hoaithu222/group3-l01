import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { chatExtPaths } from './chat-extensions.api';
import type {
  BoardOption,
  ToResourceInput,
  ToResourceResult,
  ToTaskInput,
  ToTaskResult,
  WorkspaceOption,
} from './chat-extensions.types';

/**
 * Chuyển tin thành công việc / lưu tệp của tin vào tài liệu (BE `message-conversion.controller.ts`) + hai lượt tra tối thiểu để CHỌN ĐÍCH (nhóm → bảng/cột). Hai lượt tra gọi endpoint của
 * `workspaces`/`projects` mà KHÔNG import các feature đó (`feature-structure.md`), chỉ lấy đúng trường cần.
 *
 * ⚠️ Cả hai endpoint ghi đều bắt `Idempotency-Key` (route `idempotencyKey({ required: true })`) và BE LƯU mọi phản hồi < 500 dưới khoá 24 giờ — kể cả 4xx. Nơi gọi phải đổi khoá sau một lỗi 4xx
 * (`shouldRotateIdempotencyKey`, `@/shared/hooks/useIdempotencyKey`) nếu không sẽ nhận lại đúng câu lỗi cũ dù người dùng đã sửa dữ liệu hay đã xác nhận.
 */
export const conversionService = {
  /**
   * `Idempotency-Key` BẮT BUỘC (BE `idempotencyKey({ required: true })`): sinh MỘT lần mỗi lần mở tấm, dùng lại khi bấm lại/thử lại để không sinh hai thẻ; mở tấm mới → khoá mới
   * (tạo THÊM một thẻ từ cùng tin là hợp lệ). 201 tạo mới, 200 nếu cùng khoá đã tạo (`Idempotent-Replayed`).
   */
  async toTask(messageId: string, input: ToTaskInput, idempotencyKey: string): Promise<ToTaskResult> {
    const response = await apiClient.post<ToTaskResult>(chatExtPaths.messageToTask(messageId), input, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<ToTaskResult>(response);
  },

  /**
   * Lưu tệp đính kèm của tin vào kho tài liệu của một nhóm (BE `MessageConversionService.toResource`, 201). Không nhân file: `Resource` mới trỏ cùng `assetId`. Lỗi đáng chú ý — 400 `VAL_001`:
   * `details.reason = ASSET_NOT_IN_MESSAGE | WORKSPACE_MISMATCH` (kênh: chỉ lưu vào CHÍNH nhóm của kênh) hoặc `details.requiresConfirmation = true` (nguồn hẹp hơn nhóm đích — gửi lại với
   * `confirmVisibilityExpansion: true` và KHÔNG dùng lại khoá cũ); 409 `MSG_006` (tin thu hồi/không phải tin người dùng); 404 `MSG_012` (không đọc được tin); `RSC_003` (tệp chưa sẵn sàng);
   * `RSC_007` (kho nhóm đầy); 403/404 của kho tài liệu khi thiếu quyền tải lên ở nhóm đích. `skipErrorToast`: lỗi hiện TRONG tấm để người dùng đổi nhóm/xác nhận.
   */
  async toResource(messageId: string, input: ToResourceInput, idempotencyKey: string): Promise<ToResourceResult> {
    const response = await apiClient.post<ToResourceResult>(chatExtPaths.messageToResource(messageId), input, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<ToResourceResult>(response);
  },

  async listWorkspaces(): Promise<WorkspaceOption[]> {
    const response = await apiClient.get<{ id: string; name: string }[]>(chatExtPaths.workspaces, {
      params: { status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return unwrapData<{ id: string; name: string }[]>(response).map(({ id, name }) => ({ id, name }));
  },

  /** Bảng chưa lưu trữ của một nhóm, kèm cột (`BoardSummary`). Người không có `TASK_CREATE` ở bảng nào đó vẫn thấy bảng — BE từ chối lúc tạo (`TASK_*`/`PERM_*`). */
  async listBoards(workspaceId: string): Promise<BoardOption[]> {
    const response = await apiClient.get<{ id: string; name: string; columns: { id: string; title: string }[] }[]>(
      chatExtPaths.workspaceBoards(workspaceId),
      { params: { archived: false }, skipErrorToast: true },
    );
    return unwrapData<{ id: string; name: string; columns: { id: string; title: string }[] }[]>(response).map(
      (board) => ({
        id: board.id,
        name: board.name,
        columns: board.columns.map(({ id, title }) => ({ id, title })),
      }),
    );
  },
};
