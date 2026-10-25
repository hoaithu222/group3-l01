import { useMutation, useQueryClient } from '@tanstack/react-query';

import { roadmapService } from '../api/roadmap.service';
import type {
  RoadmapLessonDto,
  RoadmapPutProgressPayload,
  RoadmapSubjectDetailDto,
} from '../api/roadmap.types';
import { roadmapKeys } from './roadmap.keys';

/**
 * `PUT /roadmap/lessons/:id/progress` với cập nhật LẠC QUAN (app.md §4) — gọi từ `useLessonProgress` (đã gom
 * 800 ms), không gọi thẳng trong component. Vá `lesson.myProgress` + `subject.progress[lessonId]`; invalidate
 * `today`/`subjects` CHỈ khi payload đổi `status` (tick checklist đơn thuần không đáng làm mới hai danh sách đó).
 *
 * ⚠️ Vá MỌI bản cache của môn qua tiền tố `subjectDetails` (khớp `id` HOẶC `slug`), không chỉ `subject(subjectId)`:
 * màn tổng quan mở từ thẻ môn giữ cache dưới khoá SLUG, nên bản cũ vá nhầm khoá ID ⇒ hoàn thành buổi xong quay lại
 * vẫn chưa thấy dấu ✓ và % đứng im (xem `roadmap.keys.ts`). `onSuccess` còn chép bộ đếm BE trả về
 * (`requiredDone`/`completedCount`) + `lastLessonId` vào `myEnrollment` để vòng % và "Tiếp tục buổi…" đúng ngay.
 *
 * ⚠️ Chỉ vá `lesson.myProgress` khi bản cũ đã tồn tại — buổi CHƯA từng có tiến độ (`myProgress: null`) thì thiếu
 * `id`/`version` thật để dựng object hợp lệ; màn hình tự giữ state lạc quan RIÊNG cho lượt tương tác đầu tiên
 * (`useLessonProgress`), rồi `onSuccess` ghi đè bằng dữ liệu thật của server.
 */
export function usePutLessonProgress(lessonId: string, subjectId: string | undefined) {
  const queryClient = useQueryClient();

  const patchSubjects = (patch: (subject: RoadmapSubjectDetailDto) => RoadmapSubjectDetailDto) => {
    if (!subjectId) return;
    queryClient.setQueriesData<RoadmapSubjectDetailDto>({ queryKey: roadmapKeys.subjectDetails }, (current) =>
      current && (current.id === subjectId || current.slug === subjectId) ? patch(current) : current,
    );
  };

  return useMutation({
    mutationFn: (payload: RoadmapPutProgressPayload) => roadmapService.putProgress(lessonId, payload),

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: roadmapKeys.lesson(lessonId) });
      // Đổi trạng thái: huỷ lần tải môn đang bay để kết quả CŨ của nó không đè lên dấu ✓ lạc quan ngay sau đây.
      if (payload.status) await queryClient.cancelQueries({ queryKey: roadmapKeys.subjectDetails });
      const previousLesson = queryClient.getQueryData<RoadmapLessonDto>(roadmapKeys.lesson(lessonId));
      const previousSubjects = queryClient.getQueriesData<RoadmapSubjectDetailDto>({
        queryKey: roadmapKeys.subjectDetails,
      });

      if (previousLesson?.myProgress) {
        queryClient.setQueryData<RoadmapLessonDto>(roadmapKeys.lesson(lessonId), {
          ...previousLesson,
          myProgress: { ...previousLesson.myProgress, ...payload },
        });
      }
      const status = payload.status;
      if (status) {
        patchSubjects((subject) => ({ ...subject, progress: { ...subject.progress, [lessonId]: status } }));
      }
      return { previousLesson, previousSubjects };
    },

    onError: (_error, _payload, context) => {
      if (context?.previousLesson) {
        queryClient.setQueryData(roadmapKeys.lesson(lessonId), context.previousLesson);
      }
      for (const [key, data] of context?.previousSubjects ?? []) queryClient.setQueryData(key, data);
    },

    onSuccess: (result, payload) => {
      queryClient.setQueryData<RoadmapLessonDto>(roadmapKeys.lesson(lessonId), (current) =>
        current ? { ...current, myProgress: result.progress } : current,
      );
      patchSubjects((subject) => ({
        ...subject,
        myEnrollment: subject.myEnrollment
          ? {
              ...subject.myEnrollment,
              completedCount: result.enrollment.completedCount,
              lastLessonId: lessonId,
              requiredDone: result.enrollment.requiredDone,
            }
          : null,
        progress: { ...subject.progress, [lessonId]: result.progress.status },
      }));
      if (payload.status) {
        void queryClient.invalidateQueries({ queryKey: roadmapKeys.today });
        void queryClient.invalidateQueries({ queryKey: roadmapKeys.subjects });
      }
    },
  });
}
