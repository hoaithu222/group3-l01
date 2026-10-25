import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { RecapDto } from '../../api/meeting-recap.types';
import { FALLBACK_RECAP_LIMITS } from '../../constants/meeting-recap.constants';
import { useMarkdownFormatting } from '../../hooks/useMarkdownFormatting';
import { useRecapDraftGuard } from '../../hooks/useRecapDraftGuard';
import { useRecapEditor } from '../../hooks/useRecapEditor';
import { useRecapFiles } from '../../hooks/useRecapFiles';
import { backToMeeting } from '../../utils/recap-navigation';
import { AttachSourceSheet } from './AttachSourceSheet';
import { MarkdownLiteToolbar } from './MarkdownLiteToolbar';
import { PublishRecapDialog } from './PublishRecapDialog';
import { RecapAttachments } from './RecapAttachments';
import { RecapConflictNotice } from './RecapConflictNotice';
import { RecapEditorField } from './RecapEditorField';
import { RecapTimeFields } from './RecapTimeFields';

export interface RecapEditorFormProps {
  initial: RecapDto;
  meetingId: string;
  title?: string;
}

/**
 * Trình soạn biên bản (app.md p2-06 §3 `RecapEditorScreen`): giờ họp thực tế · ô soạn markdown-lite + "Xem trước" · tệp đính kèm (thêm, tiến
 * độ từng tệp, gỡ) · "Lưu nháp" (thanh tiêu đề — bấm được cả khi bàn phím mở) + "Công bố" (chỉ `canPublish`). Mất mạng → nút lưu tắt kèm
 * "Kết nối lại để lưu", nội dung vẫn giữ trong bộ nhớ. 409 → khối "Bản của bạn". Rời màn khi còn thay đổi/tệp đang tải → hỏi.
 */
export function RecapEditorForm({ initial, meetingId, title }: RecapEditorFormProps) {
  const editor = useRecapEditor(meetingId, initial);
  const files = useRecapFiles(meetingId, initial.attachments.length, editor.adoptAttachment);
  const formatting = useMarkdownFormatting(editor.draft.content, (content) => editor.setDraft({ content }));
  const offline = useConnectionState() === 'offline';
  const [preview, setPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const guard = useRecapDraftGuard(editor.dirty || files.pending > 0, () => backToMeeting(meetingId));
  const busy = editor.saving || editor.publishing;
  const canPublish = initial.myActions.canPublish;
  const republish = Boolean(initial.publishedAt);

  // Rung "xong" chỉ khi SERVER đã nhận (lưu/công bố thành công) — lỗi 409/mạng đã có khối thông báo riêng, không rung.
  const saveDraft = async () => {
    if (!(await editor.save())) return;
    hapticSuccess();
    showToast('success', 'Đã lưu nháp biên bản.');
  };
  const publish = async () => {
    const dto = await editor.publish();
    setPublishOpen(false);
    if (!dto) return;
    hapticSuccess();
    showToast('success', republish ? 'Đã cập nhật biên bản đã công bố.' : 'Đã công bố biên bản.');
    backToMeeting(meetingId);
  };
  const contentError = editor.error?.code === 'MEET_023' ? editor.error.message : null;
  const generalError = editor.error && editor.error.code !== 'MEET_023' ? editor.error.message : null;

  const header = (
    <AppBar
      actions={<Button disabled={offline || !editor.dirty} label="Lưu nháp" loading={editor.saving} size="sm" onPress={() => void saveDraft()} />}
      subtitle={title}
      title={initial.recapId ? 'Sửa biên bản' : 'Viết biên bản'}
      onBack={guard.requestLeave}
    />
  );
  const footer = canPublish ? (
    <BottomActionBar>
      <Button disabled={offline || busy} fullWidth iconLeft="share-02" label={republish ? 'Cập nhật biên bản đã công bố' : 'Công bố'} onPress={() => setPublishOpen(true)} />
    </BottomActionBar>
  ) : undefined;

  return (
    <>
      <Screen footer={footer} header={header} keyboardAware>
        <View className="gap-md py-xs">
          {offline ? <Alert description="Kết nối lại để lưu. Nội dung bạn đang soạn vẫn được giữ." tone="warning" /> : null}
          {generalError ? <Alert description={generalError} tone="error" /> : null}
          <RecapConflictNotice
            conflict={editor.conflict}
            loading={loadingLatest}
            mine={editor.mine}
            onDiscardMine={editor.clearMine}
            onLoadLatest={() => {
              setLoadingLatest(true);
              void editor.loadLatest().finally(() => setLoadingLatest(false));
            }}
            onRestoreMine={editor.restoreMine}
          />
          <RecapTimeFields disabled={busy} endedAt={editor.draft.endedAt} startedAt={editor.draft.startedAt} onChange={editor.setDraft} />
          <RecapEditorField
            error={contentError}
            formatting={formatting}
            max={FALLBACK_RECAP_LIMITS.contentMax}
            value={editor.draft.content}
            onChange={(content) => editor.setDraft({ content })}
            onPreviewChange={setPreview}
          />
          <RecapAttachments
            attachments={files.attachments}
            canAdd={!offline && files.remaining > 0}
            error={files.error}
            removingId={files.removingId}
            uploads={{ items: files.uploads.items, onCancel: files.uploads.cancel, onRemove: files.uploads.remove, onRetry: files.uploads.retry }}
            onAdd={files.openPicker}
            onRemove={(assetId) => void files.detach(assetId)}
          />
        </View>
      </Screen>
      {preview ? null : <MarkdownLiteToolbar onFormat={formatting.format} />}
      <AttachSourceSheet remaining={files.remaining} visible={files.pickerOpen} onClose={files.closePicker} onPicked={files.uploads.addFiles} />
      <PublishRecapDialog loading={busy} republish={republish} visible={publishOpen} onCancel={() => setPublishOpen(false)} onConfirm={() => void publish()} />
      <Dialog
        description={files.pending > 0 ? 'Còn tệp đang tải — rời màn lúc này tệp sẽ không được đính kèm.' : 'Các thay đổi chưa lưu sẽ bị mất.'}
        primaryAction={{ label: 'Bỏ thay đổi', onPress: guard.confirm }}
        secondaryAction={{ label: 'Tiếp tục soạn', onPress: guard.cancel }}
        title="Bỏ thay đổi chưa lưu?"
        visible={guard.asking}
        onClose={guard.cancel}
      />
    </>
  );
}
