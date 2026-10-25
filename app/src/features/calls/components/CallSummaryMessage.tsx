import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatTime } from '@/shared/utils/format/date.utils';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { CallMediaKind } from '../api/calls.types';
import { useStartCall } from '../hooks/useStartCall';
import { normalizeOutcome, outcomeLabel } from '../utils/call-outcome';
import { CallErrorDialogs } from './CallErrorDialogs';

/** Phần của `MessageView` (chat) mà thẻ cần — khai cấu trúc để KHÔNG import chéo feature `chat` (cùng cách `WalletReminderMessage`). */
export interface CallSummaryMessageLike {
  createdAt: string;
  scopeId: string;
  scopeType: string;
  systemPayload: Record<string, unknown> | null;
}

/** Payload `CALL_SUMMARY` do server ghi (BE `call-summary.service.ts`): `{ callId, mediaKind, status, durationSec, initiatorId, participantIds }`. */
function readPayload(payload: Record<string, unknown> | null) {
  const p = payload ?? {};
  const mediaKind: CallMediaKind = p.mediaKind === 'VIDEO' ? 'VIDEO' : 'AUDIO';
  return {
    durationSec: typeof p.durationSec === 'number' ? p.durationSec : null,
    initiatorId: typeof p.initiatorId === 'string' ? p.initiatorId : null,
    mediaKind,
    outcome: normalizeOutcome(p.status),
  };
}

/**
 * Thẻ tóm tắt cuộc gọi trong luồng chat (`systemType CALL_SUMMARY`, app.md p2-01 §3): icon theo loại, nhãn theo GÓC NHÌN người xem
 * + thời lượng, nút "Gọi lại" (cùng loại thoại/video). Tin do SERVER ghi đúng một lần nên client không giả/không trùng được. Đăng ký
 * vào chat bằng `registerSystemMessageRenderer('CALL_SUMMARY', …)` ở `app/(app)/_layout.tsx`.
 */
export function CallSummaryMessage({ message }: { message: CallSummaryMessageLike }) {
  const meId = useAuthStore((state) => state.user?.id);
  const enabled = useFeature('voice') === true;
  const offline = useConnectionState() === 'offline';
  const { dismissFailure, failure, pending, start } = useStartCall();

  const { durationSec, initiatorId, mediaKind, outcome } = readPayload(message.systemPayload);
  const direction = initiatorId !== null && initiatorId === meId ? 'OUTGOING' : 'INCOMING';
  const label = outcomeLabel(outcome, direction, mediaKind, durationSec);
  const kind = mediaKind === 'VIDEO' ? 'video' : 'thoại';
  const scopeType = message.scopeType === 'CHANNEL' ? 'CHANNEL' : 'CONVERSATION';
  const time = formatTime(message.createdAt);

  return (
    <View
      accessibilityLabel={`Cuộc gọi ${kind}. ${label.text}. ${time}`}
      className="mx-md my-2xs flex-row items-center gap-sm self-center rounded-md bg-bg-2 px-md py-sm"
    >
      {/* Ô icon có tông theo KẾT QUẢ (cùng bảng màu dòng lịch sử cuộc gọi): nhỡ = `danger`, gọi đi = `success`, gọi đến = `info`.
          Màu chỉ để quét nhanh — chữ "Cuộc gọi nhỡ"/thời lượng bên cạnh vẫn là dấu hiệu chính. */}
      <IconTile
        name={mediaKind === 'VIDEO' ? 'video-camera' : 'phone'}
        size="sm"
        tone={label.missed ? 'danger' : direction === 'OUTGOING' ? 'success' : 'info'}
      />
      <View className="gap-3xs">
        <Text className={cn('text-label-md font-semibold', label.missed ? 'text-error' : 'text-fg-1')}>{label.text}</Text>
        <Text className="text-caption-sm text-fg-2">{time}</Text>
      </View>
      {enabled ? (
        <Button
          accessibilityLabel={`Gọi lại, cuộc gọi ${kind}`}
          disabled={offline || pending}
          label="Gọi lại"
          loading={pending}
          size="sm"
          variant="secondary"
          onPress={() => {
            hapticTap(); // xác nhận cú chạm BẮT ĐẦU gọi — trước `start` (tạo cuộc gọi qua mạng, có thể trễ)
            void start({ scopeId: message.scopeId, scopeType }, mediaKind);
          }}
        />
      ) : null}
      <CallErrorDialogs failure={failure} onClose={dismissFailure} />
    </View>
  );
}
