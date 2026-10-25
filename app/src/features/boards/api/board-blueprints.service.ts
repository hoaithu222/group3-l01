import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { boardDuplicatePath, boardTemplatesPath, workspaceBoardFromTemplatePath } from './boards.api';
import type {
  BoardTemplate,
  BoardWithLabelsDto,
  CreateBoardFromTemplatePayload,
  DuplicateBoardPayload,
} from './boards.types';

/**
 * Mẫu bảng + sao chép bảng (p3-02 P1). Cả ba lời gọi `skipErrorToast`: lỗi hiện TRONG khối đang thao tác (tấm sao chép, form tạo bảng,
 * danh sách mẫu) — toast tự tắt sau vài giây trong khi người dùng còn đang sửa. `TASK_009` (nhóm đủ bảng), 403 (MEMBER), 404 (bảng/nhóm
 * không còn với tôi) do nơi gọi đọc từ `error`.
 *
 * `Idempotency-Key` (BE `idempotencyKey("board-from-template" | "board-duplicate")`, tuỳ chọn): bấm hai lần / thử lại sau khi mất mạng
 * chỉ ra MỘT bảng. ⚠️ BE lưu cả phản hồi 4xx theo khoá nên nơi gọi phải đổi khoá sau mỗi lỗi CÓ phản hồi (`useAttemptKey`).
 */
export const boardBlueprintsService = {
  async templates(): Promise<BoardTemplate[]> {
    const response = await apiClient.get<BoardTemplate[]>(boardTemplatesPath(), { skipErrorToast: true });
    return unwrapData<BoardTemplate[]>(response) ?? [];
  },

  async createFromTemplate(
    workspaceId: string,
    payload: CreateBoardFromTemplatePayload,
    idempotencyKey: string,
  ): Promise<BoardWithLabelsDto> {
    const response = await apiClient.post<BoardWithLabelsDto>(
      workspaceBoardFromTemplatePath(workspaceId),
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<BoardWithLabelsDto>(response);
  },

  async duplicate(
    boardId: string,
    payload: DuplicateBoardPayload,
    idempotencyKey: string,
  ): Promise<BoardWithLabelsDto> {
    const response = await apiClient.post<BoardWithLabelsDto>(boardDuplicatePath(boardId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<BoardWithLabelsDto>(response);
  },
};
