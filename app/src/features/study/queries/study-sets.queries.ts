import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { studyService } from '../api/study.service';
import type {
  CreateSetPayload,
  DuplicatePayload,
  ListSetsParams,
  PatchSetPayload,
  ReportPayload,
  StudySetDetailDto,
} from '../api/study.types';
import { mockKeys } from './mock-attempts.queries';
import { srKeys } from './sr.queries';
import { studyKeys } from './study.keys';

/** Danh sách theo phạm vi (cursor 30, `staleTime` 60 s — app.md §4). `enabled=false` cho tab không đang mở. */
export function useStudySets(params: ListSetsParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: studyKeys.list(params),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      studyService.list(params, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    enabled,
    staleTime: 60_000,
  });
}

export function useStudySet(setId: string | undefined) {
  return useQuery({
    queryKey: studyKeys.detail(setId ?? ''),
    queryFn: () => studyService.get(setId as string),
    enabled: Boolean(setId),
    // 404 (không còn/không được thấy) là trạng thái nghiệp vụ — thử lại không đổi kết quả.
    retry: false,
    staleTime: 30_000,
  });
}

export function usePopularTags(workspaceId?: string) {
  return useQuery({
    queryKey: studyKeys.tags(workspaceId),
    queryFn: () => studyService.popularTags(workspaceId),
    // Thẻ phổ biến chỉ là gợi ý lọc — lỗi thì ẩn dải chip, không báo.
    retry: false,
    staleTime: 10 * 60_000,
  });
}

/** Ghi bản mới nhất của bộ vào cache `detail` và làm cũ mọi danh sách (tiêu đề/số mục/phạm vi có thể đổi). */
export function applySetToCache(queryClient: QueryClient, set: StudySetDetailDto): void {
  queryClient.setQueryData(studyKeys.detail(set.id), set);
  void queryClient.invalidateQueries({ queryKey: ['study-sets', 'list'] });
}

/** `idempotencyKey` sinh MỘT LẦN lúc mở form — bấm "Tạo" hai lần chỉ ra một bộ. */
export function useCreateSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      payload,
    }: {
      idempotencyKey: string;
      payload: CreateSetPayload;
    }) => studyService.create(payload, idempotencyKey),
    onSuccess: (set) => applySetToCache(queryClient, set),
  });
}

export function usePatchSet(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatchSetPayload) => studyService.patch(setId, payload),
    onSuccess: (set) => applySetToCache(queryClient, set),
  });
}

export function useDeleteSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => studyService.remove(setId),
    onSuccess: (_result, setId) => {
      queryClient.removeQueries({ queryKey: studyKeys.detail(setId) });
      queryClient.removeQueries({ queryKey: studyKeys.items(setId) });
      void queryClient.invalidateQueries({ queryKey: ['study-sets', 'list'] });
      // Thẻ ôn của bộ vừa xoá không còn đến hạn (số "N thẻ cần ôn" ở Trang chủ/Hoạt động) + lịch sử thi thử có lượt của bộ đó.
      void queryClient.invalidateQueries({ queryKey: srKeys.all });
      void queryClient.invalidateQueries({ queryKey: mockKeys.mine() });
    },
  });
}

export function useDuplicateSet(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      payload,
    }: {
      idempotencyKey: string;
      payload: DuplicatePayload;
    }) => studyService.duplicate(setId, payload, idempotencyKey),
    onSuccess: (copy) => applySetToCache(queryClient, copy),
  });
}

export function useReportSet(setId: string) {
  return useMutation({
    mutationFn: (payload: ReportPayload) => studyService.report(setId, payload),
  });
}
