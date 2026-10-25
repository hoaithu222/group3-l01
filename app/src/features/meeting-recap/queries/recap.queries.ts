import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { MEETINGS_DETAIL_KEY, recapKeys } from '../api/meeting-recap.keys';
import { meetingRecapService } from '../api/meeting-recap.service';
import type { RecapDto, UpsertRecapBody } from '../api/meeting-recap.types';
import { isGoneError } from '../utils/recap-errors';

/** 404 là KẾT LUẬN (không có quyền/không còn) — thử lại chỉ làm màn "không còn khả dụng" hiện chậm hơn. */
const retryUnlessGone = (failureCount: number, error: unknown): boolean => !isGoneError(error) && failureCount < 1;

/** Ghi bản server vừa trả vào cache (mọi thao tác ghi đều trả `RecapDto` mới — không cần `GET` lại). */
export function applyRecap(queryClient: QueryClient, dto: RecapDto): void {
  queryClient.setQueryData(recapKeys.detail(dto.meetingId), dto);
}

/**
 * Biên bản của cuộc họp (app.md §4.1 `staleTime` 30 s). Người sửa nhận NHÁP (chưa có ⇒ nháp rỗng ảo `version = 0`); người xem chỉ nhận
 * bản đã công bố (chưa công bố ⇒ 404 — màn nói "Chủ trì chưa công bố biên bản").
 */
export function useRecap(meetingId: string | undefined) {
  return useQuery({
    enabled: Boolean(meetingId),
    queryFn: () => meetingRecapService.get(meetingId ?? ''),
    queryKey: recapKeys.detail(meetingId ?? ''),
    retry: retryUnlessGone,
    staleTime: 30_000,
  });
}

/**
 * Lưu nháp. KHÔNG lạc quan (nhiều người cùng sửa — app.md §4.1): chờ server rồi mới ghi cache. `expectedVersion` do trình soạn giữ
 * (phiên bản LÚC BẮT ĐẦU sửa), không đọc từ cache — cache có thể đã được làm mới bằng bản của người khác và ghi đè im lặng.
 */
export function useUpsertRecap(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertRecapBody) => meetingRecapService.upsert(meetingId, body),
    onSuccess: (dto) => applyRecap(queryClient, dto),
  });
}

/** Công bố (chỉ chủ trì/đồng chủ trì): lần đầu đăng thẻ vào nhóm chat + thông báo; công bố lại sửa thẻ. Chi tiết cuộc họp đổi `hasPublishedRecap`. */
export function usePublishRecap(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion: number) => meetingRecapService.publish(meetingId, expectedVersion),
    onSuccess: (dto) => {
      applyRecap(queryClient, dto);
      void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
    },
  });
}

export function useDetachRecapAsset(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => meetingRecapService.detach(meetingId, assetId),
    onSuccess: (dto) => applyRecap(queryClient, dto),
  });
}
