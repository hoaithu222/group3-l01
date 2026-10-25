import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import type { CallActionsSlotProps } from '@/shared/calls';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { hapticTap } from '@/shared/utils/haptics';
import { useFeature } from '@/shell/capabilities';

import type { CallMediaKind } from '../api/calls.types';
import { useStartCall } from '../hooks/useStartCall';
import { CallErrorDialogs } from './CallErrorDialogs';

/** `LIMITS.call.ringMaxInvitees` của BE — nhóm lớn hơn chỉ đổ chuông 16 người, còn lại thấy banner "Tham gia" (README §2). */
const RING_MAX_INVITEES = 16;

function openMeeting(meetingId: string): void {
  router.push({ params: { meetingId }, pathname: '/meetings/[meetingId]' });
}

/**
 * Hai nút "Gọi thoại"/"Gọi video" của header hội thoại/kênh (app.md p2-01 §3). Ẩn hẳn khi cờ `voice` tắt; KHOÁ (không ẩn)
 * khi hội thoại chỉ đọc/đã chặn hoặc mất mạng — nhãn trợ năng nói rõ lý do. Bấm gọi KHÔNG xin quyền mic/camera ở đây:
 * quyền xin sau khi cuộc gọi đã tạo (`call-session.controller`), đúng quy tắc "hỏi sau khi bấm".
 */
export function CallButtons({ disabledReason, memberCount, scopeId, scopeType }: CallActionsSlotProps) {
  const enabled = useFeature('voice') === true;
  const offline = useConnectionState() === 'offline';
  const { dismissFailure, failure, pending, start } = useStartCall();
  const [confirm, setConfirm] = useState<CallMediaKind | null>(null);

  if (!enabled) return null;

  const blockedBy = disabledReason ?? (offline ? 'Cần kết nối mạng để gọi' : null);
  const disabled = pending || blockedBy !== null;

  function press(kind: CallMediaKind): void {
    if ((memberCount ?? 0) > RING_MAX_INVITEES) {
      setConfirm(kind);
      return;
    }
    hapticTap(); // xác nhận cú chạm BẮT ĐẦU gọi — trước `start` (tạo cuộc gọi qua mạng, có thể trễ)
    void start({ scopeId, scopeType }, kind);
  }

  return (
    <View className="flex-row items-center gap-2xs">
      <Button
        accessibilityLabel={blockedBy ? `Gọi thoại — ${blockedBy}` : 'Gọi thoại'}
        disabled={disabled}
        iconLeft="phone"
        iconOnly
        loading={pending}
        size="sm"
        variant="tertiary"
        onPress={() => press('AUDIO')}
      />
      <Button
        accessibilityLabel={blockedBy ? `Gọi video — ${blockedBy}` : 'Gọi video'}
        disabled={disabled}
        iconLeft="video-camera"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => press('VIDEO')}
      />
      <CallErrorDialogs failure={failure} onClose={dismissFailure} onOpenMeeting={openMeeting} />
      <Dialog
        description={`Sẽ đổ chuông tối đa ${String(RING_MAX_INVITEES)} người; mọi thành viên còn lại thấy nút Tham gia.`}
        primaryAction={{
          label: 'Gọi',
          onPress: () => {
            const kind = confirm;
            setConfirm(null);
            if (!kind) return;
            hapticTap();
            void start({ scopeId, scopeType }, kind);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirm(null) }}
        title="Gọi cả nhóm?"
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}
