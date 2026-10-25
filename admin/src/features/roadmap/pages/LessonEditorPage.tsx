import { memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWatch } from 'react-hook-form';

import { useAuthStore } from '@/app/store';
import {
  Button,
  Callout,
  Form,
  FormActions,
  FormTabs,
  PageBody,
  PageShell,
  Skeleton,
  useZodForm,
} from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import LessonEditorHeader from '../components/LessonEditorHeader';
import LessonInfoForm from '../components/LessonInfoForm';
import MarkdownEditor from '../components/MarkdownEditor';
import MediaManager from '../components/MediaManager';
import PracticeSetPicker from '../components/PracticeSetPicker';
import ResourcesEditor from '../components/ResourcesEditor';
import { lessonFormSchema, type LessonFormValues } from '../schemas/lesson.schema';
import { useAdminLesson, usePatchLesson } from '../service/roadmap.queries';
import type { AdminLessonDetail } from '../types/roadmap.types';
import { isVersionConflict } from '../utils/roadmap-errors';
import { lessonToFormValues, toPatchLessonPayload } from '../utils/lesson-form.utils';

interface LessonEditorFormProps {
  lesson: AdminLessonDetail;
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * Form GỘP của buổi học — mount lại mỗi khi `lesson.version` đổi (`key` ở component cha, mẫu
 * `SkillDetailPage`'s `key={skill.version}`) để đồng bộ `defaultValues` với dữ liệu mới nhất sau khi Lưu
 * hoặc sau khi tải lại vì xung đột phiên bản. Tiêu đề + Xuất bản/Xoá buổi ở `LessonEditorHeader`.
 */
function LessonEditorForm({ lesson, canUpdate, canDelete }: LessonEditorFormProps) {
  const form = useZodForm<LessonFormValues>(lessonFormSchema, {
    defaultValues: lessonToFormValues(lesson),
  });
  const patch = usePatchLesson();
  const conflictDialog = useDisclosure();

  const practiceSetIds = useWatch({ control: form.control, name: 'practiceSetIds' }) ?? [];

  const handleInsertMarkdown = useCallback(
    (snippet: string) => {
      const current = form.getValues('bodyMd');
      form.setValue('bodyMd', current ? `${current}\n\n${snippet}\n` : `${snippet}\n`, {
        shouldDirty: true,
      });
    },
    [form],
  );

  const handleSubmit = useCallback(
    async (values: LessonFormValues) => {
      try {
        await patch.mutateAsync(toPatchLessonPayload(lesson, values));
      } catch (err) {
        // `RES_003` — người khác vừa lưu buổi này. Interceptor đã toast; hiện thêm hộp thoại tải lại
        // (admin.md §2: "409 → hộp thoại 'Có người vừa sửa — tải lại'") thay vì chỉ để mất công gõ lại.
        if (isVersionConflict(err)) conflictDialog.open();
        throw err;
      }
    },
    [conflictDialog, lesson, patch],
  );

  return (
    <>
      <LessonEditorHeader canDelete={canDelete} canUpdate={canUpdate} lesson={lesson} />
      <PageBody overflow="scroll">
        <Form
          dirtyGuard={{
            message: 'Buổi học có thay đổi chưa lưu — rời trang sẽ mất các thay đổi này.',
          }}
          form={form}
          readOnly={!canUpdate}
          onSubmit={handleSubmit}
        >
          <FormTabs form={form}>
            <FormTabs.Panel
              fields={['title', 'summary', 'durationMinutes', 'prerequisites', 'optional']}
              label="Thông tin"
              value="info"
            >
              <LessonInfoForm />
            </FormTabs.Panel>
            <FormTabs.Panel fields={['bodyMd']} label="Nội dung" value="content">
              <MarkdownEditor />
            </FormTabs.Panel>
            <FormTabs.Panel fields={['resources']} label="Tài liệu" value="resources">
              <ResourcesEditor />
            </FormTabs.Panel>
            <FormTabs.Panel label="Luyện tập" value="practice">
              <PracticeSetPicker
                disabled={!canUpdate}
                initialOptions={lesson.practiceSets}
                value={practiceSetIds}
                onChange={(ids) => form.setValue('practiceSetIds', ids, { shouldDirty: true })}
              />
            </FormTabs.Panel>
            <FormTabs.Panel label="Hình ảnh" value="media">
              <MediaManager
                lessonId={lesson.id}
                media={lesson.media}
                onInsert={canUpdate ? handleInsertMarkdown : undefined}
              />
            </FormTabs.Panel>
          </FormTabs>

          {canUpdate && (
            <FormActions>
              <Button loading={patch.isPending} type="submit" variant="primary">
                Lưu
              </Button>
            </FormActions>
          )}
        </Form>
      </PageBody>

      {conflictDialog.isOpen && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          }
          description="Người khác vừa lưu buổi học này. Tải lại để lấy bản mới nhất trước khi sửa tiếp — thay đổi hiện tại của bạn sẽ mất."
          intent="warning"
          title="Có người vừa sửa buổi học"
        />
      )}
    </>
  );
}

/** `/roadmap/lessons/:lessonId` (admin.md §2) — trình soạn buổi, form gộp Thông tin·Nội dung·Tài liệu·Luyện tập (Hình ảnh quản lý riêng). */
const LessonEditorPage = memo(function LessonEditorPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const canUpdate = useAuthStore((s) => s.hasPermission('roadmap', 'update'));
  const canDelete = useAuthStore((s) => s.hasPermission('roadmap', 'delete'));
  const { data: lesson, isError, refetch } = useAdminLesson(lessonId);

  if (lesson) {
    return (
      <PageShell>
        <LessonEditorForm
          key={lesson.version}
          canDelete={canDelete}
          canUpdate={canUpdate}
          lesson={lesson}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Chưa có buổi (đang tải / lỗi) vẫn chiếm header — header không bao giờ trống tiêu đề. */}
      <PageHeader
        backHref="/roadmap"
        backLabel="Về danh sách lộ trình"
        title="Soạn buổi học"
        tone="teal"
        onBack={() => navigate('/roadmap')}
      />
      <PageBody overflow="scroll">
        {isError ? (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            description="Buổi học không tồn tại hoặc kết nối bị gián đoạn."
            intent="error"
            title="Không tải được buổi học"
          />
        ) : (
          <Skeleton className="w-full" height={400} />
        )}
      </PageBody>
    </PageShell>
  );
});

export default LessonEditorPage;
