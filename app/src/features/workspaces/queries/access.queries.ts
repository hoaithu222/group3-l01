import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  workspaceAccessApi,
  type UpdateWorkspaceSettingsPayload,
  type WorkspaceDetail,
  type WorkspaceSettingsDto,
} from '../api';
import { workspaceKeys } from './workspaces.keys';

/** Vá `joinPolicy`/`guestPolicy`/`version` trả về vào cache chi tiết; trường BE không gửi thì giữ nguyên. */
function applySettings(detail: WorkspaceDetail, dto: WorkspaceSettingsDto): WorkspaceDetail {
  return {
    ...detail,
    ...(dto.joinPolicy !== undefined && { joinPolicy: dto.joinPolicy }),
    ...(dto.guestPolicy !== undefined && { guestPolicy: dto.guestPolicy }),
    ...(dto.version !== undefined && { version: dto.version }),
  };
}

/**
 * `PATCH …/settings` (OWNER). Thành công → vá cache chi tiết + mời tải lại (BE là nguồn
 * thật của `version`). Lỗi 409 `RES_003` → cũng tải lại để màn thấy giá trị mới nhất.
 */
export function useUpdateWorkspaceSettings(workspaceId: string) {
  const queryClient = useQueryClient();
  const detailKey = workspaceKeys.detail(workspaceId);

  return useMutation({
    mutationFn: (payload: UpdateWorkspaceSettingsPayload) => workspaceAccessApi.updateSettings(workspaceId, payload),
    onSuccess: (dto) => {
      queryClient.setQueryData<WorkspaceDetail>(detailKey, (detail) => (detail ? applySettings(detail, dto) : detail));
      void queryClient.invalidateQueries({ queryKey: detailKey });
      // `overview.workspace` là bản chép riêng của chi tiết (màn Tổng quan nằm dưới màn Cài đặt).
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.overview(workspaceId) });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });
}

/** Huỷ yêu cầu chờ duyệt của CHÍNH MÌNH; xong thì danh sách nhóm phải bỏ thẻ "Đang chờ duyệt". */
export function useCancelJoinRequest(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workspaceAccessApi.cancelJoinRequest(workspaceId),
    onSuccess: () => {
      // MỌI danh sách (kể cả tab "Đang chờ duyệt"), không chỉ `ACTIVE`.
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}
