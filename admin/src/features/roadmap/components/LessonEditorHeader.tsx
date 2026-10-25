import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Tooltip } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import { useDeleteLesson, usePublishLesson, useUnpublishLesson } from '../service/roadmap.queries';
import type { AdminLessonDetail } from '../types/roadmap.types';
import ReasonDialog from './ReasonDialog';

interface LessonEditorHeaderProps {
  lesson: AdminLessonDetail;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * Header của trình soạn buổi (`LessonEditorPage`) trên THANH HEADER toàn cục (`PageHeader`): nút về lộ
 * trình, tên buổi + dòng phụ trạng thái, mép phải Xuất bản/Gỡ xuất bản · Xoá buổi — kèm luôn hộp thoại
 * lý do của "Xoá buổi" để nút và hộp thoại của nó ở cùng một chỗ. Render trong `LessonEditorForm` nên
 * mount lại theo `lesson.version` như form.
 */
export default function LessonEditorHeader({
  lesson,
  canUpdate,
  canDelete,
}: LessonEditorHeaderProps) {
  const navigate = useNavigate();
  const del = useDeleteLesson();
  const publish = usePublishLesson();
  const unpublish = useUnpublishLesson();
  const deleteDialog = useDisclosure();

  const handleDelete = useCallback(
    async (reason: string) => {
      await del.mutateAsync({ id: lesson.id, reason });
      deleteDialog.close();
      navigate(`/roadmap/subjects/${lesson.subjectId}`);
    },
    [del, deleteDialog, lesson.id, lesson.subjectId, navigate],
  );

  return (
    <>
      <PageHeader
        backHref={`/roadmap/subjects/${lesson.subjectId}`}
        backLabel="Về lộ trình"
        end={
          // Không quyền nào thì bỏ trống slot, không đẩy một `div` rỗng lên header.
          canUpdate || canDelete ? (
            <div className="flex items-center gap-1.5">
              {canUpdate && (
                <Button
                  loading={lesson.published ? unpublish.isPending : publish.isPending}
                  size="sm"
                  variant="stroke"
                  onClick={() =>
                    void (lesson.published ? unpublish : publish).mutateAsync(lesson.id)
                  }
                >
                  {lesson.published ? 'Gỡ xuất bản' : 'Xuất bản'}
                </Button>
              )}
              {/* Icon-only (tên đọc + tooltip giữ nhãn): bảng tên canh giữa TUYỆT ĐỐI từ xl, hai nút
                  chữ cộng dãy icon toàn cục đủ đè lên tên buổi dài ở laptop 1280px. */}
              {canDelete && (
                <Tooltip content="Xoá buổi" side="bottom">
                  <Button
                    aria-label="Xoá buổi"
                    size="sm"
                    skin="danger"
                    variant="ghost"
                    onClick={deleteDialog.open}
                  >
                    <SystemIcon name="trash-outline" size={14} />
                  </Button>
                </Tooltip>
              )}
            </div>
          ) : undefined
        }
        subtitle={lesson.published ? 'Đã xuất bản' : 'Nháp'}
        title={lesson.title}
        titleSize="sm"
        tone="teal"
        onBack={() => navigate(`/roadmap/subjects/${lesson.subjectId}`)}
      />
      <ReasonDialog
        confirmTone="danger"
        impact={`Xoá MỀM buổi "${lesson.title}" — học viên không còn thấy buổi này trong lộ trình.`}
        open={deleteDialog.isOpen}
        title="Xoá buổi học"
        onConfirm={handleDelete}
        onOpenChange={(next) => !next && deleteDialog.close()}
      />
    </>
  );
}
