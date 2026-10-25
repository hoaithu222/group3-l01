import { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { hapticTap } from '@/shared/utils/haptics';

import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useCommentComposer } from '../../hooks/useCommentComposer';
import type { TaskAccess } from '../../utils/task-permissions';
import { AttachSourceSheet } from './AttachSourceSheet';
import { MentionTextInput } from './MentionTextInput';

export interface TaskCommentComposerProps {
  access: TaskAccess;
  boardId: string;
  taskId: string;
}

const READ_ONLY_COPY: Record<NonNullable<TaskAccess['readOnlyReason']>, string> = {
  archived: 'Bảng đã lưu trữ — chỉ xem.',
  deleted: 'Thẻ đã bị xoá.',
  loading: '',
  offline: 'Kết nối lại để gửi bình luận.',
  permission: 'Bạn không có quyền bình luận thẻ này.',
};

/**
 * Ô soạn bình luận DÍNH ĐÁY (app.md §2 `TaskCommentComposer`) — nhắc tên `@` từ thành viên bảng, đính kèm
 * (scope `TASK_COMMENT`, tối đa 5 tệp), nháp giữ theo thẻ. Không dùng `Composer` của chat (p1-04): nó nằm
 * trong `features/chat` và gắn với scope tin nhắn (outbox, gửi vào kênh) — xem `mention-compose.ts`.
 * `KeyboardStickyView` như ô soạn của chat: bám lên trên bàn phím, KHÔNG cộng `insets.bottom` (đã do `Screen`).
 */
export function TaskCommentComposer({ access, boardId, taskId }: TaskCommentComposerProps) {
  const composer = useCommentComposer({ boardId, canComment: access.canComment, taskId });
  const [attaching, setAttaching] = useState(false);
  const reason = access.readOnlyReason;

  if (!access.canComment) {
    if (!reason || reason === 'loading') return null;
    return (
      <View className="flex-row items-center gap-2xs border-t border-divider-1 bg-bg-1 px-md py-sm">
        <Icon color="fg-2" name={reason === 'offline' ? 'flash-off' : 'lock'} size={16} />
        <Text className="flex-1 text-caption-lg text-fg-2">{READ_ONLY_COPY[reason]}</Text>
      </View>
    );
  }

  return (
    <KeyboardStickyView>
      <View className="border-t border-divider-1 bg-bg-1">
        {composer.invalidLabels.length > 0 ? (
          <Text accessibilityLiveRegion="polite" className="px-md pt-xs text-caption-lg text-error">
            {`Không thể nhắc: ${composer.invalidLabels.map((label) => `@${label}`).join(', ')} (không thuộc nhóm). Xoá họ khỏi bình luận để gửi.`}
          </Text>
        ) : null}

        <AttachmentTray
          items={composer.uploads.items}
          onCancel={composer.uploads.cancel}
          onRemove={composer.uploads.remove}
          onRetry={composer.uploads.retry}
        />

        <View className="flex-row items-end gap-xs px-md py-2xs">
          <Button
            accessibilityLabel="Đính kèm vào bình luận"
            iconLeft="add-circle"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={() => setAttaching(true)}
          />
          <View className="flex-1">
            <MentionTextInput
              input={composer.mention}
              placeholder="Viết bình luận…"
              text={composer.draft.text}
            />
          </View>
          <Button
            accessibilityLabel="Gửi bình luận"
            disabled={!composer.canSend}
            iconLeft="circle-arrow-up"
            iconOnly
            size="sm"
            onPress={() => {
              // Gửi = hành động chính: rung nhẹ ngay lúc chạm (bình luận hiện lạc quan, lệnh gửi còn chờ mạng).
              hapticTap();
              composer.send();
            }}
          />
        </View>

        {composer.length > FALLBACK_TASK_LIMITS.commentMax - 200 ? (
          <Text
            className={
              composer.overLimit
                ? 'px-md pb-xs text-caption-sm text-error'
                : 'px-md pb-xs text-caption-sm text-fg-2'
            }
          >
            {`${composer.length}/${FALLBACK_TASK_LIMITS.commentMax}`}
          </Text>
        ) : null}
      </View>

      <AttachSourceSheet
        remaining={Math.max(
          0,
          FALLBACK_TASK_LIMITS.commentAttachmentsMax - composer.uploads.items.length,
        )}
        title="Đính kèm vào bình luận"
        visible={attaching}
        onClose={() => setAttaching(false)}
        onPicked={composer.addFiles}
      />
    </KeyboardStickyView>
  );
}
