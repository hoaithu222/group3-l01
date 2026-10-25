import { useState } from 'react';
import { Text, View } from 'react-native';

import type { BlockRequest } from '@/shared/stores/moderation-intent.store';
import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useRetainedRequest } from '../hooks/useRetainedRequest';
import { useBlockUser, useUnblockUser } from '../queries/blocks.queries';
import { blockErrorMessage } from '../utils/moderation-errors';

/** Hậu quả nói THẲNG (app.md p1-08 §3 `BlockConfirmSheet`) — không "Ban/Kick", và nói rõ họ KHÔNG được báo. */
const BLOCK_CONSEQUENCES = [
  'Hai bên không nhắn tin 1-1 hoặc gọi cho nhau.',
  'Hai bên không thấy trạng thái hoạt động của nhau.',
  'Tin của họ trong nhóm và kênh được thu gọn — bạn vẫn xem được khi chạm.',
  'Họ không được báo về việc này.',
];

const UNBLOCK_CONSEQUENCES = [
  'Hai bên có thể nhắn tin cho nhau trở lại (nếu còn chung nhóm làm việc).',
  'Tin của họ trong nhóm và kênh không còn bị thu gọn.',
];

export interface BlockConfirmSheetProps {
  onClose: () => void;
  /** `null` = đóng. */
  request: BlockRequest | null;
}

/**
 * Hộp xác nhận CHẶN / BỎ CHẶN (p1-08 #8) — luôn hỏi trước khi chặn, không chặn ngay khi bấm. Tự gọi
 * mutation (lạc quan, xem `blocks.queries.ts`) nên hai nơi dùng nó — `ModerationHost` (từ thẻ người dùng,
 * thông tin 1-1) và `BlockedUsersScreen` (bỏ chặn) — không phải lặp lại luồng gọi + xử lý lỗi.
 * Lỗi hiện TRONG tấm (`error` của `ConfirmSheet`, ngay trên hàng nút): `BLOCK_004` (quá 500 người) là câu người dùng cần
 * đọc kỹ, toast tự tắt sau 4 giây.
 *
 * ✅ `ConfirmSheet` (ô khoá + câu hỏi canh giữa, [Huỷ | Chặn]) thay cho hai `Button fullWidth` trần trong `flex-row` — hai
 * khối `width: 100%` không co nên nút xác nhận bị đẩy ra ngoài mép tấm. Đang gửi thì "Huỷ" + nền mờ bị khoá.
 */
export function BlockConfirmSheet({ onClose, request }: BlockConfirmSheetProps) {
  const { retained, session } = useRetainedRequest(request);
  if (!retained) return null;
  return (
    <BlockConfirmBody
      key={session}
      request={retained}
      visible={request !== null}
      onClose={onClose}
    />
  );
}

interface BlockConfirmBodyProps {
  onClose: () => void;
  request: BlockRequest;
  visible: boolean;
}

function BlockConfirmBody({ onClose, request, visible }: BlockConfirmBodyProps) {
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isBlock = request.mode === 'block';
  const name = request.name?.trim() || 'người này';
  const mutation = isBlock ? block : unblock;

  function confirm(): void {
    setErrorMessage(null);
    mutation.mutate(request.userId, {
      onSuccess: () => {
        hapticSuccess(); // việc đã XONG (server xác nhận) — đi cùng toast, không thay toast
        showToast('success', isBlock ? `Đã chặn ${name}` : `Đã bỏ chặn ${name}`);
        onClose();
      },
      onError: (error) => setErrorMessage(blockErrorMessage(error)),
    });
  }

  return (
    <ConfirmSheet
      confirmLabel={isBlock ? 'Chặn' : 'Bỏ chặn'}
      error={errorMessage}
      icon="lock"
      loading={mutation.isPending}
      title={isBlock ? `Chặn ${name}?` : `Bỏ chặn ${name}?`}
      tone={isBlock ? 'danger' : 'primary'}
      visible={visible}
      onClose={onClose}
      onConfirm={confirm}
    >
      {/* Hậu quả là DANH SÁCH canh trái trong khối nền nhạt (chữ canh giữa nhiều dòng khó đọc thành từng ý); dấu chấm tách
          riêng một cột để dòng xuống hàng thụt đúng dưới chữ, không trôi về dưới dấu chấm. */}
      <View accessibilityRole="list" className="gap-xs rounded-xs bg-surface-neutral p-sm">
        {(isBlock ? BLOCK_CONSEQUENCES : UNBLOCK_CONSEQUENCES).map((line) => (
          <View key={line} className="flex-row items-start gap-xs">
            <Text
              accessibilityElementsHidden
              className="text-body-md text-fg-2"
              importantForAccessibility="no"
            >
              •
            </Text>
            <Text className="flex-1 text-body-md text-fg-2">{line}</Text>
          </View>
        ))}
      </View>
    </ConfirmSheet>
  );
}
