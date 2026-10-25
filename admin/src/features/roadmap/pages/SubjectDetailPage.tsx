import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Button, Callout, PageBody, PageShell, Skeleton } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import CreatePhaseModal from '../components/CreatePhaseModal';
import PhaseLessonTree from '../components/PhaseLessonTree';
import PhasePanel from '../components/PhasePanel';
import ReasonDialog from '../components/ReasonDialog';
import SubjectFormModal from '../components/SubjectFormModal';
import SubjectHeaderActions, { type SubjectAction } from '../components/SubjectHeaderActions';
import {
  useAdminSubject,
  useArchiveSubject,
  useDeleteSubject,
  usePublishSubject,
  useUnpublishSubject,
} from '../service/roadmap.queries';
import type { RoadmapSubjectStatus } from '../types/roadmap.types';

const STATUS_META: Record<RoadmapSubjectStatus, { label: string }> = {
  DRAFT: { label: 'Nháp' },
  PUBLISHED: { label: 'Đã xuất bản' },
  ARCHIVED: { label: 'Lưu trữ' },
};

/**
 * `/roadmap/subjects/:subjectId` (admin.md §2) — trái cây Tháng→Buổi (`PhaseLessonTree`, chỉ điều
 * hướng/chọn, xem lý do trong file đó), phải thông tin tháng đang chọn (`PhasePanel`). Thanh header
 * (`SubjectHeaderActions`): Xuất bản / Gỡ xuất bản / Lưu trữ (gỡ + lưu trữ cần lý do). "Xoá lộ trình"
 * KHÔNG có trong mô tả màn ở admin.md §2 nhưng be.md §4 có endpoint + README §7 cấp quyền
 * `roadmap:delete` — thêm mục menu "⋯" để quyền đó có chỗ dùng, không để mồ côi trên UI.
 */
const SubjectDetailPage = memo(function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const canCreate = useAuthStore((s) => s.hasPermission('roadmap', 'create'));
  const canUpdate = useAuthStore((s) => s.hasPermission('roadmap', 'update'));
  const canDelete = useAuthStore((s) => s.hasPermission('roadmap', 'delete'));

  const { data: subject, isError, refetch } = useAdminSubject(subjectId);
  const [explicitPhaseId, setExplicitPhaseId] = useState<string | null>(null);
  const editModal = useDisclosure();
  const createPhaseModal = useDisclosure();
  const [action, setAction] = useState<SubjectAction | null>(null);

  const publish = usePublishSubject();
  const unpublish = useUnpublishSubject();
  const archive = useArchiveSubject();
  const del = useDeleteSubject();

  const phases = useMemo(
    () => (subject ? [...subject.phases].sort((a, b) => a.order - b.order) : []),
    [subject],
  );
  const selectedPhaseId = explicitPhaseId ?? phases[0]?.id ?? null;
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null;

  const handleSelectLesson = useCallback(
    (lessonId: string) => navigate(`/roadmap/lessons/${lessonId}`),
    [navigate],
  );

  const handleConfirmAction = useCallback(
    async (reason: string) => {
      if (!subject || !action) return;
      if (action === 'unpublish') await unpublish.mutateAsync({ id: subject.id, reason });
      else if (action === 'archive') await archive.mutateAsync({ id: subject.id, reason });
      else {
        await del.mutateAsync({ id: subject.id, reason });
        navigate('/roadmap');
      }
      setAction(null);
    },
    [action, archive, del, navigate, subject, unpublish],
  );

  let body: React.ReactNode;
  if (subject) {
    body = (
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex h-[600px] flex-col gap-2 rounded-md border border-border-2 bg-bg-2 p-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-caption-12-medium text-fg-4">Tháng · {subject.lessonLabel}</span>
            {canCreate && (
              <Button size="sm" variant="ghost" onClick={createPhaseModal.open}>
                <SystemIcon name="plus-outline" size={14} />
              </Button>
            )}
          </div>
          <PhaseLessonTree
            lessonLabel={subject.lessonLabel}
            phases={phases}
            selectedPhaseId={selectedPhaseId}
            onSelectLesson={handleSelectLesson}
            onSelectPhase={setExplicitPhaseId}
          />
        </div>
        <div>
          {selectedPhase ? (
            <PhasePanel
              canCreate={canCreate}
              canDelete={canDelete}
              canUpdate={canUpdate}
              phase={selectedPhase}
              subject={subject}
            />
          ) : (
            <Callout
              description={`Bấm "+" ở cây bên trái để thêm tháng đầu tiên.`}
              intent="neutral"
              title="Chưa có tháng nào"
            />
          )}
        </div>
      </div>
    );
  } else if (isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Lộ trình không tồn tại hoặc kết nối bị gián đoạn."
        intent="error"
        title="Không tải được lộ trình"
      />
    );
  } else {
    body = <Skeleton className="w-full" height={400} />;
  }

  return (
    <PageShell>
      <PageHeader
        backHref="/roadmap"
        backLabel="Về danh sách lộ trình"
        end={
          subject && canUpdate ? (
            <SubjectHeaderActions
              canDelete={canDelete}
              publishing={publish.isPending}
              status={subject.status}
              onAction={setAction}
              onEdit={editModal.open}
              onPublish={() => void publish.mutateAsync(subject.id)}
            />
          ) : undefined
        }
        subtitle={subject ? STATUS_META[subject.status].label : undefined}
        title={subject?.title ?? 'Chi tiết lộ trình'}
        titleSize="sm"
        tone="teal"
        onBack={() => navigate('/roadmap')}
      />
      <PageBody overflow="scroll">{body}</PageBody>

      {subject && (
        <>
          <SubjectFormModal open={editModal.isOpen} subject={subject} onClose={editModal.close} />
          <ReasonDialog
            confirmTone="primary"
            impact="Học viên đang xem lộ trình sẽ không thấy bản đã xuất bản nữa; bản nháp vẫn giữ nguyên để sửa tiếp."
            open={action === 'unpublish'}
            title="Gỡ xuất bản lộ trình"
            onConfirm={handleConfirmAction}
            onOpenChange={(next) => !next && setAction(null)}
          />
          <ReasonDialog
            confirmTone="danger"
            impact="Lộ trình chuyển sang Lưu trữ — ẩn khỏi danh sách người học, có thể xuất bản lại sau."
            open={action === 'archive'}
            title="Lưu trữ lộ trình"
            onConfirm={handleConfirmAction}
            onOpenChange={(next) => !next && setAction(null)}
          />
          <ReasonDialog
            confirmTone="danger"
            impact="Xoá MỀM toàn bộ lộ trình (kèm tháng/buổi) — có thể cần đội kỹ thuật khôi phục nếu cần dùng lại."
            open={action === 'delete'}
            title="Xoá lộ trình"
            onConfirm={handleConfirmAction}
            onOpenChange={(next) => !next && setAction(null)}
          />
          {createPhaseModal.isOpen && (
            <CreatePhaseModal subjectId={subject.id} onClose={createPhaseModal.close} />
          )}
        </>
      )}
    </PageShell>
  );
});

export default SubjectDetailPage;
