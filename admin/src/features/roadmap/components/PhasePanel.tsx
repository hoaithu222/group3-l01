import { memo, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  ColorPickerField,
  Form,
  FormActions,
  FormModal,
  Table,
  TableDragHandle,
  TextareaField,
  TextField,
  useZodForm,
} from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';

import { createLessonQuickSchema, type CreateLessonQuickValues } from '../schemas/lesson.schema';
import { PHASE_CAPSTONE_MAX, PHASE_SUMMARY_MAX, phaseFormSchema, type PhaseFormValues } from '../schemas/phase.schema';
import {
  useCreateLesson,
  useDeletePhase,
  usePatchPhase,
  usePublishLesson,
  useReorderRoadmap,
  useUnpublishLesson,
} from '../service/roadmap.queries';
import { computeOrderBetween, newRoadmapIdempotencyKey } from '../service/roadmap.service';
import type { AdminLessonSummary, AdminPhase, AdminSubjectDetail } from '../types/roadmap.types';
import { phaseToFormValues, toPatchPhasePayload } from '../utils/phase-form.utils';
import ReasonDialog from './ReasonDialog';

interface CreateLessonModalProps {
  phaseId: string;
  lessonLabel: string;
  onClose: () => void;
  onCreated: (lessonId: string) => void;
}

/** Modal thu gọn "+ Thêm buổi" — mount MỚI mỗi lần mở (điều khiển bằng render có điều kiện ở `PhasePanel`)
 * nên form + `Idempotency-Key` luôn sạch, không cần tự reset (mẫu `BadgeFormModal`). */
function CreateLessonModal({ phaseId, lessonLabel, onClose, onCreated }: CreateLessonModalProps) {
  const form = useZodForm<CreateLessonQuickValues>(createLessonQuickSchema, { defaultValues: { title: '' } });
  const create = useCreateLesson();
  const [idempotencyKey] = useState(newRoadmapIdempotencyKey);

  const handleSubmit = useCallback(
    async (data?: CreateLessonQuickValues) => {
      if (!data) return;
      const res = await create.mutateAsync({ phaseId, title: data.title, bodyMd: '', idempotencyKey });
      onCreated(res.data.id);
    },
    [create, idempotencyKey, onCreated, phaseId],
  );

  return (
    <FormModal<CreateLessonQuickValues>
      confirmLabel="Tạo và soạn nội dung"
      form={form}
      open
      size="sm"
      title={`Thêm ${lessonLabel.toLowerCase()}`}
      onConfirm={handleSubmit}
      onOpenChange={(next) => !next && onClose()}
    >
      <TextField label="Tiêu đề" name="title" required />
      <p className="text-caption-12 text-fg-4">Soạn nội dung, tài liệu, ảnh ở trang tiếp theo.</p>
    </FormModal>
  );
}

export interface PhasePanelProps {
  subject: AdminSubjectDetail;
  phase: AdminPhase;
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
}

/**
 * Panel phải của `SubjectDetailPage` (admin.md §2) — thông tin tháng đang chọn (form riêng, CAS
 * `expectedVersion` của TỪNG tháng) + danh sách buổi trong tháng, kéo-thả sắp xếp qua `Table sortable`
 * (xem lý do KHÔNG dùng `Tree` để kéo ở `PhaseLessonTree`). Mỗi lần thả → `PUT .../order` MỘT lần với
 * ĐÚNG buổi vừa di chuyển (`order` float mới, `computeOrderBetween`), không gửi lại cả mảng.
 *
 * Sắp xếp THÁNG (không phải buổi) dùng nút chuyển lên/xuống (`handleMovePhase`) thay vì kéo-thả —
 * `PhaseLessonTree` chỉ điều hướng, không có UI danh sách tháng nào khác để kéo. Cùng mutation
 * `reorder`/công thức `computeOrderBetween` với sắp xếp buổi, chỉ gửi `phases[]` thay vì `lessons[]`.
 */
const PhasePanel = memo(function PhasePanel({ subject, phase, canUpdate, canCreate, canDelete }: PhasePanelProps) {
  const navigate = useNavigate();
  const form = useZodForm<PhaseFormValues>(phaseFormSchema, { defaultValues: phaseToFormValues(phase) });
  const patchPhase = usePatchPhase();
  const deletePhase = useDeletePhase();
  const publishLesson = usePublishLesson();
  const unpublishLesson = useUnpublishLesson();
  const reorder = useReorderRoadmap();
  const deleteDialog = useDisclosure();
  const createLessonModal = useDisclosure();

  const lessons = useMemo(() => [...phase.lessons].sort((a, b) => a.order - b.order), [phase.lessons]);
  // Danh sách tháng TOÀN MÔN (không chỉ tháng đang chọn) — cần để tìm tháng liền kề khi bấm
  // nút chuyển lên/xuống (`handleMovePhase` bên dưới), cùng công thức `computeOrderBetween`
  // với kéo-thả buổi ở `handleReorder`.
  const sortedPhases = useMemo(() => [...subject.phases].sort((a, b) => a.order - b.order), [subject.phases]);
  const phaseIndex = sortedPhases.findIndex((p) => p.id === phase.id);
  const canMoveUp = phaseIndex > 0;
  const canMoveDown = phaseIndex !== -1 && phaseIndex < sortedPhases.length - 1;

  const handleSavePhase = useCallback(
    async (values: PhaseFormValues) => {
      await patchPhase.mutateAsync(toPatchPhasePayload(phase, values));
    },
    [patchPhase, phase],
  );

  const handleDeletePhase = useCallback(
    async (reason: string) => {
      await deletePhase.mutateAsync({ id: phase.id, reason });
      deleteDialog.close();
    },
    [deleteDialog, deletePhase, phase.id],
  );

  const handleReorder = useCallback(
    (activeKey: string | number, overKey: string | number) => {
      const fromIndex = lessons.findIndex((l) => l.id === activeKey);
      const toIndex = lessons.findIndex((l) => l.id === overKey);
      if (fromIndex === -1 || toIndex === -1) return;
      const forward = fromIndex < toIndex;
      const prev = lessons[toIndex - (forward ? 0 : 1)];
      const next = lessons[toIndex + (forward ? 1 : 0)];
      const order = computeOrderBetween(
        prev && prev.id !== activeKey ? prev.order : undefined,
        next && next.id !== activeKey ? next.order : undefined,
      );
      void reorder.mutateAsync({
        subjectId: subject.id,
        expectedVersion: subject.version,
        lessons: [{ id: String(activeKey), phaseId: phase.id, order }],
      });
    },
    [lessons, phase.id, reorder, subject.id, subject.version],
  );

  /**
   * Chuyển tháng ĐANG CHỌN lên/xuống MỘT vị trí — thay cho kéo-thả (kit2 `Tree` khoá cứng
   * `disableDrag`/`disableDrop`, xem JSDoc `PhaseLessonTree`). Cùng công thức
   * `computeOrderBetween` với `handleReorder` ở trên (nguồn `sortedPhases` thay vì `lessons`,
   * gửi `phases[]` thay vì `lessons[]` trong `reorderSchema`); dùng CHUNG mutation `reorder`
   * với `handleReorder` — cùng CAS `subject.version` nên hai thao tác không thể chồng lấn.
   */
  const handleMovePhase = useCallback(
    (direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
      if (phaseIndex === -1 || toIndex < 0 || toIndex >= sortedPhases.length) return;
      const forward = direction === 'down';
      const prev = sortedPhases[toIndex - (forward ? 0 : 1)];
      const next = sortedPhases[toIndex + (forward ? 1 : 0)];
      const order = computeOrderBetween(
        prev && prev.id !== phase.id ? prev.order : undefined,
        next && next.id !== phase.id ? next.order : undefined,
      );
      void reorder.mutateAsync({
        subjectId: subject.id,
        expectedVersion: subject.version,
        phases: [{ id: phase.id, order }],
      });
    },
    [phase.id, phaseIndex, reorder, sortedPhases, subject.id, subject.version],
  );

  const columns = useMemo<TableColumn<AdminLessonSummary>[]>(
    () => [
      { key: 'drag', header: '', width: 32, cell: () => <TableDragHandle /> },
      { key: 'number', header: '#', width: 40, align: 'right', cell: (l) => l.number },
      {
        key: 'title',
        header: subject.lessonLabel,
        cell: (l) => (
          <Link className="text-body-14 text-link hover:underline" to={`/roadmap/lessons/${l.id}`}>
            {l.title}
          </Link>
        ),
      },
      {
        key: 'optional',
        header: '',
        width: 90,
        cell: (l) =>
          l.optional ? (
            <Badge color="neutral" size="sm" variant="tinted">
              Tuỳ chọn
            </Badge>
          ) : null,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        width: 120,
        cell: (l) => (
          <Badge color={l.published ? 'success' : 'neutral'} size="sm" variant="tinted">
            {l.published ? 'Đã xuất bản' : 'Nháp'}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: 120,
        cell: (l) =>
          canUpdate ? (
            <Button
              loading={l.published ? unpublishLesson.isPending : publishLesson.isPending}
              size="sm"
              variant="ghost"
              onClick={() => void (l.published ? unpublishLesson : publishLesson).mutateAsync(l.id)}
            >
              {l.published ? 'Gỡ xuất bản' : 'Xuất bản'}
            </Button>
          ) : null,
      },
    ],
    [canUpdate, publishLesson, subject.lessonLabel, unpublishLesson],
  );

  return (
    <div className="flex flex-col gap-4">
      {canUpdate && (
        <div className="flex items-center justify-between">
          <span className="text-body-14-medium text-fg-1">Thứ tự tháng</span>
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Chuyển "${phase.title}" lên một vị trí`}
              disabled={!canMoveUp}
              loading={reorder.isPending}
              size="sm"
              variant="stroke"
              onClick={() => handleMovePhase('up')}
            >
              <SystemIcon name="angle-up-outline" size={14} />
            </Button>
            <Button
              aria-label={`Chuyển "${phase.title}" xuống một vị trí`}
              disabled={!canMoveDown}
              loading={reorder.isPending}
              size="sm"
              variant="stroke"
              onClick={() => handleMovePhase('down')}
            >
              <SystemIcon name="angle-down-outline" size={14} />
            </Button>
          </div>
        </div>
      )}
      <Form dirtyGuard form={form} readOnly={!canUpdate} onSubmit={handleSavePhase}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Tiêu đề tháng" name="title" required />
          <TextField label="Giai đoạn lớn" name="stageLabel" placeholder="Giai đoạn 1 — Nền móng giao diện" />
        </div>
        <TextareaField label="Tóm tắt" maxLength={PHASE_SUMMARY_MAX} name="summary" rows={2} showCount />
        <ColorPickerField label="Màu" name="color" />
        <TextareaField
          label="Dự án cuối tháng (markdown)"
          maxLength={PHASE_CAPSTONE_MAX}
          name="capstone"
          rows={3}
          showCount
        />
        {canUpdate && (
          <FormActions>
            <Button loading={patchPhase.isPending} type="submit" variant="primary">
              Lưu thông tin tháng
            </Button>
            {canDelete && (
              <Button
                disabled={lessons.length > 0}
                title={lessons.length > 0 ? `Xoá hết ${subject.lessonLabel.toLowerCase()} trong tháng trước` : undefined}
                type="button"
                variant="stroke"
                onClick={deleteDialog.open}
              >
                Xoá tháng
              </Button>
            )}
          </FormActions>
        )}
      </Form>

      <div className="flex items-center justify-between">
        <span className="text-body-14-medium text-fg-1">{subject.lessonLabel} trong tháng</span>
        {canCreate && (
          <Button
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            variant="stroke"
            onClick={createLessonModal.open}
          >
            Thêm {subject.lessonLabel.toLowerCase()}
          </Button>
        )}
      </div>
      <Table
        columns={columns}
        data={lessons}
        emptyMessage={`Chưa có ${subject.lessonLabel.toLowerCase()} nào`}
        pagination={false}
        rowKey={(l) => l.id}
        sortable={canUpdate}
        onReorder={handleReorder}
      />

      <ReasonDialog
        confirmTone="danger"
        impact={`Xoá tháng "${phase.title}" — chỉ xoá được khi tháng chưa có ${subject.lessonLabel.toLowerCase()} nào.`}
        open={deleteDialog.isOpen}
        title="Xoá tháng"
        onConfirm={handleDeletePhase}
        onOpenChange={(next) => !next && deleteDialog.close()}
      />

      {createLessonModal.isOpen && (
        <CreateLessonModal
          lessonLabel={subject.lessonLabel}
          phaseId={phase.id}
          onClose={createLessonModal.close}
          onCreated={(lessonId) => {
            createLessonModal.close();
            navigate(`/roadmap/lessons/${lessonId}`);
          }}
        />
      )}
    </div>
  );
});

export default PhasePanel;
