import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { roadmapService } from '../api/roadmap.service';
import type {
  RoadmapEnrollPayload,
  RoadmapPatchEnrollmentPayload,
  RoadmapSubjectDetailDto,
} from '../api/roadmap.types';
import { roadmapKeys } from './roadmap.keys';

/** Danh sách môn (app.md §4: `staleTime` 60 s — không phân trang, `LIMITS.roadmap.subjectsMax` = 50). */
export function useRoadmapSubjects() {
  return useQuery({
    queryKey: roadmapKeys.subjects,
    queryFn: () => roadmapService.subjects(),
    staleTime: 60_000,
  });
}

/** Tổng quan MỘT môn (tháng + buổi tóm tắt + tiến độ + lịch). `idOrSlug` rỗng ⇒ query tắt. */
export function useRoadmapSubject(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: roadmapKeys.subject(idOrSlug ?? ''),
    queryFn: () => roadmapService.subject(idOrSlug as string),
    enabled: Boolean(idOrSlug),
    // Môn nháp/đã xoá ⇒ 404 trung tính (README §7) — trạng thái nghiệp vụ, thử lại không đổi kết quả.
    retry: false,
    staleTime: 60_000,
  });
}

/** Nội dung đầy đủ MỘT buổi (`staleTime` 10 phút — app.md §4 "nội dung ít đổi"). */
export function useRoadmapLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: roadmapKeys.lesson(lessonId ?? ''),
    queryFn: () => roadmapService.lesson(lessonId as string),
    enabled: Boolean(lessonId),
    // 404 (chưa xuất bản) / 403 `RMAP_006` (SEQUENTIAL chưa mở) đều là trạng thái nghiệp vụ.
    retry: false,
    staleTime: 10 * 60_000,
  });
}

/** Ảnh của buổi — tải khi mở tab Nội dung (có ảnh) hoặc tab Hình ảnh (app.md §4), không tải trước. */
export function useRoadmapMedia(lessonId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: roadmapKeys.media(lessonId ?? ''),
    queryFn: () => roadmapService.media(lessonId as string),
    enabled: Boolean(lessonId) && enabled,
    retry: false,
    staleTime: 10 * 60_000,
  });
}

/** Thẻ "Hôm nay học gì" — một dòng mỗi enrollment `ACTIVE` (app.md §4: `staleTime` 60 s). */
export function useRoadmapToday() {
  return useQuery({
    queryKey: roadmapKeys.today,
    queryFn: () => roadmapService.today(),
    staleTime: 60_000,
  });
}

/**
 * Đăng ký lộ trình (`EnrollSheet`) — thành công thì thẻ môn + tổng quan môn + Hôm nay đều có thể đổi.
 *
 * ⚠️ Làm mới theo TIỀN TỐ `subjectDetails`, không theo `subject(subjectId)`: màn tổng quan mở từ thẻ môn giữ cache
 * dưới khoá SLUG, nên bản cũ chỉ làm mới khoá ID ⇒ đăng ký xong màn vẫn hiện "Bắt đầu lộ trình" (xem `roadmap.keys.ts`).
 */
export function useEnrollSubject(subjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      payload,
    }: {
      idempotencyKey: string;
      payload: RoadmapEnrollPayload;
    }) => roadmapService.enroll(subjectId, payload, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.subjectDetails });
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.subjects });
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.today });
    },
  });
}

/** Đổi thứ học / tạm dừng đăng ký — vá MỌI bản cache của môn (slug lẫn id, xem `roadmap.keys.ts`). */
export function usePatchEnrollment(enrollmentId: string, subjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoadmapPatchEnrollmentPayload) =>
      roadmapService.patchEnrollment(enrollmentId, payload),
    onSuccess: (enrollment) => {
      queryClient.setQueriesData<RoadmapSubjectDetailDto>(
        { queryKey: roadmapKeys.subjectDetails },
        (current) =>
          current?.id === subjectId ? { ...current, myEnrollment: enrollment } : current,
      );
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.today });
    },
  });
}

/**
 * Dời lịch khi trễ (bước 12, P1) — không nhận payload (BE tự re-anchor). Vá cache ĐÚNG khuôn `usePatchEnrollment`:
 * tiền tố `subjectDetails` (slug lẫn id cùng lúc) + làm mới `today` (số buổi trễ ở thẻ "Hôm nay" đổi theo).
 */
export function useRescheduleEnrollment(enrollmentId: string, subjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => roadmapService.reschedule(enrollmentId),
    onSuccess: (enrollment) => {
      queryClient.setQueriesData<RoadmapSubjectDetailDto>(
        { queryKey: roadmapKeys.subjectDetails },
        (current) =>
          current?.id === subjectId ? { ...current, myEnrollment: enrollment } : current,
      );
      void queryClient.invalidateQueries({ queryKey: roadmapKeys.today });
    },
  });
}
