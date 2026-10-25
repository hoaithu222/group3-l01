import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { mentionsToPlainText, newClientMessageId, type ChatScopeRef } from '@/features/chat';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { useConnectionState } from '@/core/socket';

import { useConvertToTask } from '../../hooks/useConvertToTask';
import { useChatExtLimits } from '../../hooks/useChatSubFeatures';
import type { TaskSource } from '../../store/chat-ext-intent.store';
import { taskHref } from '../../utils/chat-ext-routes';
import { describeChatExtError } from '../../utils/error-info';
import { TaskTargetPicker, type TaskTarget } from './TaskTargetPicker';

export interface ConvertToTaskSheetProps {
  scope: ChatScopeRef;
  /** `null` khi không có ý định mở — tấm giữ nội dung tĩnh trong lúc trượt xuống. */
  source: TaskSource | null;
  visible: boolean;
  onClose: () => void;
}

/** Tiêu đề mặc định: dòng đầu của tin (chữ thuần, không marker nhắc tên), tối đa 80 ký tự — người dùng sửa được. */
function defaultTitle(content: string | null): string {
  const firstLine =
    mentionsToPlainText(content ?? '', [])
      .trim()
      .split(/\r?\n/)[0] ?? '';
  return [...firstLine].slice(0, 80).join('');
}

/**
 * Tấm "Tạo task" từ MỘT tin (p7-04 app.md §3 `ConvertToTaskSheet`): chọn bảng/cột, tiêu đề (mặc định 80 ký tự đầu), "Kèm trích dẫn". Thẻ chỉ mang LIÊN KẾT về tin + (tuỳ chọn) trích dẫn — BE không
 * sao chép nội dung tin riêng tư sang bảng của nhóm khác, và không tự sao tệp đính kèm. Xong ⇒ tấm đổi sang "Đã tạo công việc" + nút "Mở"; chip "Đã tạo task" hiện ngay trên tin (cache `sourceRefs`).
 *
 * `Idempotency-Key` sinh MỘT lần mỗi lượt mở (host đổi `key`): bấm lại không sinh hai thẻ. Lỗi ở lại trong tấm để chọn lại bảng (vd `WORKSPACE_MISMATCH` được giải thích bằng lời).
 */
export function ConvertToTaskSheet({ scope, source, visible, onClose }: ConvertToTaskSheetProps) {
  const limits = useChatExtLimits();
  const offline = useConnectionState() === 'offline';
  const [idempotencyKey] = useState(newClientMessageId);
  const convert = useConvertToTask(scope, source?.messageId ?? null);
  const [target, setTarget] = useState<TaskTarget>({});
  const [title, setTitle] = useState(() => defaultTitle(source?.content ?? null));
  // Kênh: mặc định kèm trích dẫn; hội thoại: mặc định TẮT (nội dung riêng tư) — bật tay nếu muốn.
  const [includeQuote, setIncludeQuote] = useState(scope.scopeType === 'CHANNEL');

  const fixedWorkspaceId = source?.workspaceId;
  const workspaceId = fixedWorkspaceId ?? target.workspaceId;
  const trimmed = title.trim();
  const canSubmit = Boolean(source && target.boardId && trimmed.length > 0);
  const error = convert.isError ? describeChatExtError(convert.error) : undefined;
  const created = convert.data;

  const submit = () => {
    if (!canSubmit || !target.boardId) return;
    convert.mutate({
      idempotencyKey,
      input: {
        boardId: target.boardId,
        ...(target.columnId ? { columnId: target.columnId } : {}),
        title: trimmed,
        includeQuote,
      },
    });
  };

  const done = { label: 'Xong', onPress: onClose };

  return (
    <BottomSheet
      // Lỗi ghim dưới tiêu đề (khe `alert`) — nằm đầu vùng cuộn thì cuộn xuống chọn bảng là lỗi trôi mất khỏi tầm nhìn.
      alert={!created && error ? <Alert description={error.message} tone="error" /> : undefined}
      dismissOnBackdrop={!convert.isPending}
      footer={
        created ? (
          // ✅ `SheetActions` [Xong | Mở công việc] thay cho hai `Button` tự xếp chồng; không có nhóm để mở thì chỉ còn "Xong".
          <SheetActions
            primary={
              workspaceId
                ? {
                    label: 'Mở công việc',
                    onPress: () => {
                      onClose();
                      router.push(taskHref(workspaceId, created.task.boardId, created.task.id));
                    },
                  }
                : done
            }
            secondary={workspaceId ? done : undefined}
          />
        ) : (
          <Button
            disabled={offline || !canSubmit}
            fullWidth
            label={offline ? 'Kết nối lại để gửi' : 'Tạo công việc'}
            loading={convert.isPending}
            onPress={submit}
          />
        )
      }
      scrollable
      title="Tạo công việc từ tin nhắn"
      visible={visible}
      onClose={onClose}
    >
      {/* ⛔ Không `pb-*` cuối thân: vùng `footer` tự cách nội dung 12dp. */}
      {created ? (
        <View className="flex-row items-center gap-sm">
          <IconTile name="checkmark-circle" size="md" tone="success" />
          <Text accessibilityLiveRegion="polite" className="flex-1 text-body-md text-fg-1">
            {`Đã tạo công việc “${created.task.title}”.`}
          </Text>
        </View>
      ) : (
        <View className="gap-md">
          <Input
            label="Tiêu đề"
            maxLength={limits.task.titleMax}
            placeholder="Tên công việc"
            value={title}
            onChangeText={setTitle}
          />
          <TaskTargetPicker
            fixedWorkspaceId={fixedWorkspaceId}
            value={target}
            onChange={setTarget}
          />
          <Toggle
            description="Chỉ áp dụng khi bảng cùng nhóm với tin; tin nhắn 1-1 luôn chỉ kèm liên kết."
            label="Kèm trích dẫn nội dung tin"
            value={includeQuote}
            onChange={setIncludeQuote}
          />
        </View>
      )}
    </BottomSheet>
  );
}
