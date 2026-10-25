import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import type { AdminSubjectsParams } from '../types/roadmap.types';
import { roadmapService } from './roadmap.service';

/**
 * Query key admin Lộ trình học (admin.md p4-07 §3). `subject(id)` nằm DƯỚI `subjectsAll()` và
 * `lesson(id)` nằm DƯỚI `lessonsAll()` — như `gamification`'s `badge()`/`badgesAll()` — nên MỘT lần
 * invalidate theo prefix làm mới cả danh sách lẫn chi tiết đang mở (phase/lesson đổi số đếm ăn ngược lên
 * cả cây môn lẫn dòng bảng danh sách, nên mọi mutation dưới môn/tháng/buổi đều invalidate `subjectsAll()`).
 */
export const roadmapAdminKeys = {
  subjectsAll: () => ['roadmap-admin', 'subjects'] as const,
  subjects: (params: AdminSubjectsParams) => ['roadmap-admin', 'subjects', 'list', params] as const,
  subject: (id: string) => ['roadmap-admin', 'subjects', 'detail', id] as const,
  lessonsAll: () => ['roadmap-admin', 'lessons'] as const,
  lesson: (id: string) => ['roadmap-admin', 'lessons', 'detail', id] as const,
  assetUrl: (assetId: string) => ['roadmap-admin', 'asset-url', assetId] as const,
};

function invalidateTree(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: roadmapAdminKeys.subjectsAll() });
  void qc.invalidateQueries({ queryKey: roadmapAdminKeys.lessonsAll() });
  void qc.invalidateQueries({ queryKey: auditLogKeys.all });
}

// ── Subject ──────────────────────────────────────────────────────────────────

/** `GET /admin/roadmap/subjects`. */
export const useAdminSubjects = (params: AdminSubjectsParams) =>
  useQuery({
    queryKey: roadmapAdminKeys.subjects(params),
    queryFn: () => roadmapService.listSubjects(params),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/** `GET /admin/roadmap/subjects/:id` — cây đầy đủ; không thử lại 404 (môn không tồn tại/đã xoá). */
export const useAdminSubject = (id: string | undefined) =>
  useQuery({
    queryKey: roadmapAdminKeys.subject(id ?? ''),
    queryFn: () => roadmapService.getSubject(id as string),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

export const useCreateSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.createSubject,
    onSuccess: () => {
      showToast('success', 'Đã tạo lộ trình');
      void qc.invalidateQueries({ queryKey: roadmapAdminKeys.subjectsAll() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `PATCH /admin/roadmap/subjects/:id` — làm mới cả khi lỗi (CAS `RES_003` cần `version` mới). */
export const usePatchSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.patchSubject,
    onSuccess: () => showToast('success', 'Đã lưu thông tin lộ trình'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useDeleteSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.deleteSubject,
    onSuccess: () => {
      showToast('success', 'Đã xoá lộ trình');
      invalidateTree(qc);
    },
  });
};

export const usePublishSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.publishSubject,
    onSuccess: () => showToast('success', 'Đã xuất bản lộ trình'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useUnpublishSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.unpublishSubject,
    onSuccess: () => showToast('success', 'Đã gỡ xuất bản lộ trình'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useArchiveSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.archiveSubject,
    onSuccess: () => showToast('success', 'Đã lưu trữ lộ trình'),
    onSettled: () => invalidateTree(qc),
  });
};

/** `PUT /admin/roadmap/subjects/:id/order` — kéo-thả sắp xếp tháng/buổi, MỘT lần khi thả. */
export const useReorderRoadmap = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.reorder,
    onError: () => showToast('error', 'Không lưu được thứ tự — tải lại trang và thử lại'),
    onSettled: () => invalidateTree(qc),
  });
};

// ── Phase ────────────────────────────────────────────────────────────────────

export const useCreatePhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.createPhase,
    onSuccess: () => {
      showToast('success', 'Đã thêm tháng');
      invalidateTree(qc);
    },
  });
};

export const usePatchPhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.patchPhase,
    onSuccess: () => showToast('success', 'Đã lưu thông tin tháng'),
    onSettled: () => invalidateTree(qc),
  });
};

/** `RMAP_003` (còn buổi trong tháng) — interceptor đã toast thông điệp cụ thể. */
export const useDeletePhase = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.deletePhase,
    onSuccess: () => {
      showToast('success', 'Đã xoá tháng');
      invalidateTree(qc);
    },
  });
};

// ── Lesson ───────────────────────────────────────────────────────────────────

export const useCreateLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.createLesson,
    onSuccess: () => {
      showToast('success', 'Đã thêm buổi');
      invalidateTree(qc);
    },
  });
};

/** `GET /admin/roadmap/lessons/:id` — có `bodyMd`/`blocks`; không thử lại 404. */
export const useAdminLesson = (id: string | undefined) =>
  useQuery({
    queryKey: roadmapAdminKeys.lesson(id ?? ''),
    queryFn: () => roadmapService.getLesson(id as string),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

export const usePatchLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.patchLesson,
    onSuccess: () => showToast('success', 'Đã lưu buổi học'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useDeleteLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.deleteLesson,
    onSuccess: () => {
      showToast('success', 'Đã xoá buổi học');
      invalidateTree(qc);
    },
  });
};

export const usePublishLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.publishLesson,
    onSuccess: () => showToast('success', 'Đã xuất bản buổi học'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useUnpublishLesson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.unpublishLesson,
    onSuccess: () => showToast('success', 'Đã gỡ xuất bản buổi học'),
    onSettled: () => invalidateTree(qc),
  });
};

// ── Media ────────────────────────────────────────────────────────────────────

export const useAddMedia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.addMedia,
    onSuccess: () => {
      showToast('success', 'Đã thêm ảnh');
      invalidateTree(qc);
    },
  });
};

export const usePatchMedia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.patchMedia,
    onSuccess: () => showToast('success', 'Đã lưu ảnh'),
    onSettled: () => invalidateTree(qc),
  });
};

export const useDeleteMedia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roadmapService.deleteMedia,
    onSuccess: () => {
      showToast('success', 'Đã xoá ảnh');
      invalidateTree(qc);
    },
  });
};

/** URL ký ảnh (kind `ASSET`). Hết hạn ngắn ⇒ `staleTime` 30 giây; lỗi không thử lại/không toast (rơi về icon placeholder). */
export const useRoadmapAssetUrl = (assetId: string | null | undefined) =>
  useQuery({
    queryKey: roadmapAdminKeys.assetUrl(assetId ?? ''),
    queryFn: () => roadmapService.assetUrl(assetId as string),
    select: (res) => res.url,
    enabled: !!assetId,
    staleTime: 30_000,
    retry: false,
  });
