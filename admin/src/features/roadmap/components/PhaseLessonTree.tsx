import { useCallback, useMemo } from 'react';
import type { NodeApi } from 'react-arborist';

import { Badge, Tree } from '@/shared/ui';
import type { TreeNodeData } from '@/shared/ui';

import type { AdminPhase } from '../types/roadmap.types';

export interface PhaseLessonTreeProps {
  phases: AdminPhase[];
  /** `Subject.lessonLabel` ("Buổi" | "Ngày" | "Bài") — nhãn hiển thị mỗi dòng buổi. */
  lessonLabel: string;
  selectedPhaseId: string | null;
  loading?: boolean;
  onSelectPhase: (phaseId: string) => void;
  onSelectLesson: (lessonId: string) => void;
}

const PHASE_PREFIX = 'phase:';
const LESSON_PREFIX = 'lesson:';

/**
 * Cây Tháng → Buổi của `SubjectDetailPage` (admin.md §2) — dựng trên kit2 `Tree`.
 *
 * ⚠️ `Tree` (`src/shared/ui/data-display/Tree.tsx`) khoá cứng `disableDrag`/`disableDrop` ("chưa implement
 * các tính năng này"), nên KHÔNG dùng để kéo-thả sắp xếp như admin.md §2 gợi ý — cây này CHỈ điều hướng
 * (chọn tháng → `PhasePanel`; chọn buổi → điều hướng `LessonEditorPage`). Sắp xếp buổi chuyển sang
 * `Table sortable` trong `PhasePanel`; sắp xếp THÁNG dùng nút chuyển lên/xuống cũng ở `PhasePanel`
 * (panel của tháng đang chọn — xem `handleMovePhase`), KHÔNG đặt trong cây này để tránh phải can thiệp
 * event click/select vốn đã tinh vi của `Tree` (xem JSDoc `TreeNodeRow` trong file đó).
 */
export default function PhaseLessonTree({
  phases,
  lessonLabel,
  selectedPhaseId,
  loading,
  onSelectPhase,
  onSelectLesson,
}: PhaseLessonTreeProps) {
  const data = useMemo<TreeNodeData[]>(
    () =>
      [...phases]
        .sort((a, b) => a.order - b.order)
        .map((phase) => ({
          id: `${PHASE_PREFIX}${phase.id}`,
          name: `Tháng ${phase.index} · ${phase.title}`,
          children: [...phase.lessons]
            .sort((a, b) => a.order - b.order)
            .map((lesson) => ({
              id: `${LESSON_PREFIX}${lesson.id}`,
              name: `${lessonLabel} ${lesson.number} · ${lesson.title}`,
              published: lesson.published,
              optional: lesson.optional,
            })),
        })),
    [phases, lessonLabel],
  );

  const handleSelect = useCallback(
    (ids: string[]) => {
      const id = ids[0];
      if (!id) return;
      if (id.startsWith(PHASE_PREFIX)) onSelectPhase(id.slice(PHASE_PREFIX.length));
      else if (id.startsWith(LESSON_PREFIX)) onSelectLesson(id.slice(LESSON_PREFIX.length));
    },
    [onSelectLesson, onSelectPhase],
  );

  const renderTrailing = useCallback(
    (node: NodeApi<TreeNodeData>) => {
      if (!node.isLeaf) {
        const count = node.data.children?.length ?? 0;
        return `${count} ${lessonLabel.toLowerCase()}`;
      }
      const published = Boolean(node.data.published);
      const optional = Boolean(node.data.optional);
      return (
        <span className="flex items-center gap-1.5">
          {optional && (
            <Badge color="neutral" size="sm" variant="tinted">
              Tuỳ chọn
            </Badge>
          )}
          <span
            aria-label={published ? 'Đã xuất bản' : 'Nháp'}
            className={published ? 'text-success' : 'text-fg-4'}
            title={published ? 'Đã xuất bản' : 'Nháp'}
          >
            ●
          </span>
        </span>
      );
    },
    [lessonLabel],
  );

  return (
    <Tree
      data={data}
      emptyMessage="Chưa có tháng nào — bấm “Thêm tháng” để bắt đầu."
      height="100%"
      loading={loading}
      openByDefault
      renderTrailing={renderTrailing}
      selectedIds={selectedPhaseId ? [`${PHASE_PREFIX}${selectedPhaseId}`] : []}
      onSelect={handleSelect}
    />
  );
}
