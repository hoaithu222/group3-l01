import { useCallback, useEffect, useRef, useState } from 'react';

import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type {
  RoadmapLessonDto,
  RoadmapProgressDto,
  RoadmapPutProgressPayload,
} from '../api/roadmap.types';
import { roadmapErrorMessage } from '../constants/roadmap-error-codes.constants';
import { PROGRESS_DEBOUNCE_MS } from '../constants/roadmap.constants';
import { usePutLessonProgress } from '../queries/roadmap-progress.mutations';
import { lessonCode } from '../utils/lesson-title';

export interface LessonProgressView {
  status: RoadmapProgressDto['status'];
  checkedItemIds: string[];
  selfRating: 1 | 2 | 3 | null;
  note: string | null;
}

const EMPTY_VIEW: LessonProgressView = {
  status: 'NOT_STARTED',
  checkedItemIds: [],
  selfRating: null,
  note: null,
};

function toView(progress: RoadmapProgressDto | null): LessonProgressView {
  if (!progress) return EMPTY_VIEW;
  const { status, checkedItemIds, selfRating, note } = progress;
  return { status, checkedItemIds, selfRating, note };
}

type FlushCallbacks = {
  onError?: (error: unknown) => void;
  onSettled?: () => void;
  onSuccess?: () => void;
};

/**
 * Tiến độ MỘT buổi học — gom tick checklist/tự đánh giá/ghi chú **800 ms** trước khi bắn `PUT progress` (README
 * §4 luồng 4, app.md §2 `useLessonProgress`). Giữ state lạc quan RIÊNG (không đọc thẳng `lesson.myProgress` mỗi
 * lần vẽ) để gõ ghi chú/tick liên tiếp không bị giật về giá trị cũ trong lúc đang chờ debounce.
 *
 * ⚠️ Chuyển buổi (`LessonFooter`) dùng `router.replace` sang route `[lessonId]` khác ⇒ màn cũ UNMOUNT (cleanup effect
 * bên dưới gửi nốt phần đang chờ) rồi màn mới mount lại hook này với `lesson` mới. Nhờ vậy `view` chỉ cần nạp MỘT LẦN
 * lúc mount (lazy initializer) — không cần effect đồng bộ lại theo `lesson.id` (mà làm vậy còn phạm luật "không
 * `setState` đồng bộ trong effect" của React Compiler). ⛔ Đổi sang `push` là sai giả định: native stack GIỮ màn cũ sống
 * bên dưới, cleanup không chạy cho tới khi người dùng lùi hết về.
 */
export function useLessonProgress(lesson: RoadmapLessonDto, subjectId: string) {
  const mutation = usePutLessonProgress(lesson.id, subjectId);
  const [view, setView] = useState<LessonProgressView>(() => toView(lesson.myProgress));
  // Cờ RIÊNG cho nút "Hoàn thành": `mutation.isPending` bật cả khi đang gửi một tick checklist ⇒ nút quay vòng dù người
  // học chưa bấm gì.
  const [completing, setCompleting] = useState(false);
  const pendingRef = useRef<RoadmapPutProgressPayload>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `mutation.mutate` KHÔNG ổn định qua các lần vẽ (React Query trả object mới mỗi lần) — giữ qua ref để
  // `flush`/`schedule` không phải nạp lại theo nó, nếu không effect dọn dẹp bên dưới sẽ gọi `flush` ở MỌI lần vẽ
  // lại chứ không chỉ lúc unmount, phá luôn tác dụng gom 800 ms.
  const mutateRef = useRef(mutation.mutate);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  });

  const flush = useCallback((callbacks?: FlushCallbacks) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    mutateRef.current(patch, callbacks);
  }, []);

  // Rời màn (hoặc unmount vì điều hướng) ⇒ gửi nốt phần đang chờ, không rơi rớt tick cuối cùng.
  useEffect(() => () => flush(), [flush]);

  const schedule = useCallback(
    (patch: RoadmapPutProgressPayload) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(), PROGRESS_DEBOUNCE_MS);
    },
    [flush],
  );

  const toggleChecklistItem = (itemId: string) => {
    const checked = view.checkedItemIds.includes(itemId);
    const checkedItemIds = checked
      ? view.checkedItemIds.filter((id) => id !== itemId)
      : [...view.checkedItemIds, itemId];
    // app.md §7.5: tick ≥ 1 mục ⇒ tự chuyển `IN_PROGRESS`.
    const status =
      checkedItemIds.length > 0 && view.status === 'NOT_STARTED' ? 'IN_PROGRESS' : view.status;
    setView({ ...view, checkedItemIds, status });
    schedule({ checkedItemIds, status: status === view.status ? undefined : status });
  };

  const setSelfRating = (selfRating: 1 | 2 | 3) => {
    setView({ ...view, selfRating });
    schedule({ selfRating });
  };

  const setNote = (note: string) => {
    setView({ ...view, note });
    schedule({ note });
  };

  /**
   * Nút "Hoàn thành buổi" — hành động rõ ràng của người dùng, bỏ qua gom 800 ms và gửi NGAY, kèm phản hồi.
   *
   * ⚠️ Lỗi ⇒ trả trạng thái về như trước + báo lỗi: `onError` của mutation chỉ hoàn CACHE, còn `view` là state riêng
   * của màn — bản cũ vẫn hiện "Đã hoàn thành" dù máy chủ từ chối, người học rời đi tưởng đã lưu.
   */
  const complete = () => {
    const previous = view.status;
    setView({ ...view, status: 'COMPLETED' });
    setCompleting(true);
    pendingRef.current = { ...pendingRef.current, status: 'COMPLETED' };
    flush({
      onError: (error) => {
        setView((current) => ({ ...current, status: previous }));
        showToast('error', roadmapErrorMessage(error));
      },
      onSettled: () => setCompleting(false),
      onSuccess: () => {
        // Rung "xong việc" khi máy chủ ĐÃ nhận — cùng nhịp với toast; lỗi thì không rung (trạng thái đã hoàn về như cũ).
        hapticSuccess();
        showToast('success', `Đã hoàn thành ${lessonCode(lesson.lessonLabel, lesson.number)}`);
      },
    });
  };

  return { complete, completing, setNote, setSelfRating, toggleChecklistItem, view };
}
