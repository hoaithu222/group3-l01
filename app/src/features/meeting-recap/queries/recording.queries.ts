import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { MEETINGS_DETAIL_KEY, recordingKeys } from '../api/meeting-recap.keys';
import { meetingRecordingService } from '../api/meeting-recap.service';
import type { RecordingDto } from '../api/meeting-recap.types';
import { isGoneError } from '../utils/recap-errors';

const retryUnlessGone = (failureCount: number, error: unknown): boolean => !isGoneError(error) && failureCount < 1;

/** Danh sách bản ghi (người xem: READY; người điều khiển: cả đang xử lý/lỗi). Socket `meeting:recording-updated` làm mới. */
export function useMeetingRecordings(meetingId: string | undefined) {
  return useQuery({
    enabled: Boolean(meetingId),
    queryFn: () => meetingRecordingService.list(meetingId ?? ''),
    queryKey: recordingKeys.list(meetingId ?? ''),
    retry: retryUnlessGone,
    staleTime: 15_000,
  });
}

export function useRecording(recordingId: string | undefined) {
  return useQuery({
    enabled: Boolean(recordingId),
    queryFn: () => meetingRecordingService.get(recordingId ?? ''),
    queryKey: recordingKeys.detail(recordingId ?? ''),
    retry: retryUnlessGone,
    staleTime: 15_000,
  });
}

/** Xoá (chủ trì theo lịch / OWNER workspace kèm lý do): gỡ khỏi danh sách ngay khi server xác nhận, chi tiết cuộc họp đổi số bản ghi. */
export function useDeleteRecording(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, recordingId }: { reason?: string; recordingId: string }) =>
      meetingRecordingService.remove(recordingId, reason),
    onSuccess: (_void, { recordingId }) => {
      queryClient.setQueryData<RecordingDto[]>(recordingKeys.list(meetingId), (list) => list?.filter((rec) => rec.id !== recordingId));
      queryClient.removeQueries({ queryKey: recordingKeys.detail(recordingId) });
      void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
    },
  });
}

/** "Thử lại" bản FAILED mà egress đã ghi tệp (`canRetry`) → 202 `PROCESSING`; vá hàng tại chỗ. */
export function useRetryImport(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordingId: string) => meetingRecordingService.retryImport(recordingId),
    onSuccess: (dto) => {
      queryClient.setQueryData<RecordingDto[]>(recordingKeys.list(meetingId), (list) => list?.map((rec) => (rec.id === dto.id ? dto : rec)));
      queryClient.setQueryData(recordingKeys.detail(dto.id), dto);
    },
  });
}
