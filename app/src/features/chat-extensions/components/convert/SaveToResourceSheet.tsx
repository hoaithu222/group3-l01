import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import type { ChatScopeRef } from '@/features/chat';
import { shouldRotateIdempotencyKey, useIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

import { useConvertToResource } from '../../hooks/useConvertToResource';
import type { ResourceSource } from '../../store/chat-ext-intent.store';
import { resourcesHref } from '../../utils/chat-ext-routes';
import { describeChatExtError, needsVisibilityConfirmation } from '../../utils/error-info';
import { ResourceFilePicker } from './ResourceFilePicker';
import { ResourceTargetPicker } from './ResourceTargetPicker';

export interface SaveToResourceSheetProps {
  scope: ChatScopeRef;
  /** `null` khi không có ý định mở — tấm giữ nội dung tĩnh trong lúc trượt xuống. */
  source: ResourceSource | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm "Lưu vào tài liệu" từ MỘT tin có tệp (p7-04 app.md §3): chọn tệp (mặc định hết) + nhóm đích (kênh: cố định) → `POST /messages/:id/to-resource`. Không nhân file — `Resource` mới trỏ cùng tệp gốc, tệp
 * vẫn ở tin. Xong ⇒ tấm đổi sang "Đã lưu" + nút "Mở tài liệu"; chip "Đã lưu vào tài liệu" hiện ngay trên tin (cache `sourceRefs`).
 *
 * XÁC NHẬN mở rộng người xem: nguồn hẹp hơn nhóm đích (hội thoại, kênh riêng tư) thì BE trả 400 `VAL_001 details.requiresConfirmation` — tấm chuyển sang BƯỚC XÁC NHẬN ngay trong tấm (không mở hộp
 * thoại thứ hai chồng lên: hai `<Modal>` xếp chồng hay lỗi trên iOS), "Vẫn lưu" gửi lại với `confirmVisibilityExpansion: true`, "Quay lại" về form. Người dùng KHÔNG tự bật cờ này trước: chỉ BE biết
 * kênh nào riêng tư.
 *
 * `Idempotency-Key` theo nội dung form (`useIdempotencyKey`): bấm hai lần/thử lại sau mất mạng chỉ lưu MỘT lần; sau lỗi 4xx (kể cả câu hỏi xác nhận) khoá ĐỔI — BE lưu cả phản hồi 400 dưới khoá cũ
 * 24 giờ, gửi lại cùng khoá là nhận lại đúng câu cũ dù đã xác nhận.
 */
export function SaveToResourceSheet({ scope, source, visible, onClose }: SaveToResourceSheetProps) {
  const offline = useConnectionState() === 'offline';
  const files = source?.attachments ?? [];
  const [picked, setPicked] = useState(() => files.map((file) => file.assetId));
  const [chosenWorkspaceId, setChosenWorkspaceId] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const convert = useConvertToResource(scope, source?.messageId ?? null);

  const fixedWorkspaceId = source?.workspaceId;
  const workspaceId = fixedWorkspaceId ?? chosenWorkspaceId;
  const idempotency = useIdempotencyKey('to-resource', `${workspaceId ?? ''}|${picked.join(',')}`);
  const created = convert.data;
  const asking = !created && convert.isError && needsVisibilityConfirmation(convert.error);
  // Bấm "Vẫn lưu" ⇒ `isError` tắt ngay khi mutation chạy lại: giữ bước xác nhận cho tới khi có kết quả (không nháy về form giữa chừng).
  const confirmStep = asking || (convert.isPending && confirmed);
  const error = convert.isError && !asking ? describeChatExtError(convert.error) : undefined;
  const canSubmit = Boolean(source) && !offline && workspaceId !== undefined && picked.length > 0;

  const submit = (confirm: boolean) => {
    if (!canSubmit || !workspaceId) return;
    setConfirmed(confirm);
    convert.mutate(
      { idempotencyKey: idempotency.key, input: { workspaceId, assetIds: picked, confirmVisibilityExpansion: confirm } },
      {
        onError: (failure) => {
          if (shouldRotateIdempotencyKey(failure)) idempotency.rotate();
        },
      },
    );
  };
  const back = () => {
    setConfirmed(false);
    convert.reset();
  };

  let footer;
  if (created) {
    footer = (
      <View className="gap-xs">
        {workspaceId ? (
          <Button
            fullWidth
            label="Mở tài liệu"
            onPress={() => {
              onClose();
              router.push(resourcesHref(workspaceId));
            }}
          />
        ) : null}
        <Button fullWidth label="Xong" variant="secondary" onPress={onClose} />
      </View>
    );
  } else if (confirmStep) {
    footer = (
      <SheetActions
        layout="column"
        primary={{ label: 'Vẫn lưu vào tài liệu', loading: convert.isPending, onPress: () => submit(true) }}
        secondary={{ disabled: convert.isPending, label: 'Quay lại', onPress: back }}
      />
    );
  } else {
    footer = (
      <Button
        disabled={!canSubmit}
        fullWidth
        label={offline ? 'Kết nối lại để lưu' : 'Lưu vào tài liệu'}
        loading={convert.isPending}
        onPress={() => submit(false)}
      />
    );
  }

  let body;
  if (created) {
    body = (
      <Text accessibilityLiveRegion="polite" className="pb-md text-body-md text-fg-1">
        {created.resources.length === 1 ? 'Đã lưu 1 tệp vào tài liệu.' : `Đã lưu ${String(created.resources.length)} tệp vào tài liệu.`}
      </Text>
    );
  } else if (confirmStep) {
    body = (
      <View className="pb-md">
        <Alert
          description="Tệp này đang nằm trong một cuộc trò chuyện hoặc kênh riêng tư. Nếu lưu vào tài liệu, mọi thành viên của nhóm đích đều xem được tệp."
          title="Mở rộng người xem tệp?"
          tone="warning"
        />
      </View>
    );
  } else {
    body = (
      <View className="gap-md pb-md">
        {error ? <Alert description={error.message} tone="error" /> : null}
        <ResourceFilePicker files={files} picked={picked} onChange={setPicked} />
        <ResourceTargetPicker fixedWorkspaceId={fixedWorkspaceId} value={chosenWorkspaceId} onChange={setChosenWorkspaceId} />
      </View>
    );
  }

  return (
    <BottomSheet
      dismissOnBackdrop={!convert.isPending}
      footer={footer}
      scrollable
      title={confirmStep ? 'Xác nhận lưu tệp' : 'Lưu vào tài liệu'}
      visible={visible}
      onClose={onClose}
    >
      {body}
    </BottomSheet>
  );
}
