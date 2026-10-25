import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useCallStore } from '../store/call.store';
import { useCallTimer } from '../hooks/useCallTimer';
import { leaveRoom } from '../voice-room/hooks/voice-room.actions';
import { useRoomControls } from '../voice-room/hooks/useRoomControls';

/**
 * Thanh "Cuộc gọi đang diễn ra — Quay lại" khi người dùng THU NHỎ cuộc gọi (rời màn `call/[callId]` mà cuộc gọi còn sống;
 * README p2-01 §5.4). Media vẫn chạy (`useCallSession`). Chạm ⇒ về màn cuộc gọi. Không vẽ khi không có cuộc gọi đang diễn ra.
 *
 * Phòng thoại kênh (p2-03): "#tên-kênh · 5 người — Quay lại phòng" kèm nút mic + Rời. Chủ phòng bấm Rời thì về màn phòng để chọn
 * người nhận quyền (không rời "mù" từ thanh nhỏ).
 */
export function MiniCallBar() {
  const queryClient = useQueryClient();
  const meId = useAuthStore((state) => state.user?.id) ?? null;
  const phase = useCallStore((state) => state.phase);
  const callId = useCallStore((state) => state.callId);
  const minimized = useCallStore((state) => state.minimized);
  const room = useCallStore((state) => (state.call?.mode === 'ROOM' ? state.call : null));
  const clock = useCallTimer();
  const controls = useRoomControls();

  const live = phase === 'outgoing' || phase === 'connecting' || phase === 'active';
  if (!live || !minimized || !callId) return null;

  const open = () => router.push({ params: { callId }, pathname: '/call/[callId]' });

  if (room) {
    const people = room.participants.filter((p) => p.state === 'CONNECTED' || p.state === 'JOINING' || p.state === 'RECONNECTING').length;
    const isHost = meId !== null && room.hostId === meId;
    return (
      <View className="flex-row items-center bg-action-success pr-xs">
        <Pressable
          accessibilityLabel={`Phòng thoại ${room.scope.title}, ${String(people)} người. Quay lại phòng`}
          accessibilityRole="button"
          className="min-h-11 flex-1 flex-row items-center gap-xs px-md py-2xs active:opacity-70"
          onPress={open}
        >
          <Icon color="action-success-fg" name="mic-01" size={16} />
          <Text className="flex-1 text-label-md text-action-success-fg" numberOfLines={1}>
            #{room.scope.title} · {people} người — Quay lại phòng
          </Text>
        </Pressable>
        <Button
          accessibilityLabel={controls.audioBlocked ? 'Micro bị chủ phòng chặn' : controls.micOn ? 'Tắt micro' : 'Bật micro'}
          disabled={controls.audioBlocked}
          iconLeft="mic-01"
          iconOnly
          size="sm"
          variant={controls.micOn ? 'neutral-secondary' : 'danger-secondary'}
          onPress={() => void controls.toggleMic()}
        />
        <Button
          accessibilityLabel="Rời phòng"
          iconLeft="cancel"
          iconOnly
          size="sm"
          variant="danger"
          onPress={() => (isHost ? open() : void leaveRoom({}, queryClient))}
        />
      </View>
    );
  }

  return (
    <View className="bg-action-success">
      <Pressable
        accessibilityLabel="Cuộc gọi đang diễn ra. Quay lại cuộc gọi"
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-center gap-xs px-md py-2xs active:opacity-70"
        onPress={open}
      >
        <Icon color="action-success-fg" name="phone" size={16} />
        <Text className="text-label-md text-action-success-fg">
          {phase === 'active' ? `Cuộc gọi đang diễn ra · ${clock}` : 'Đang gọi…'} — Quay lại
        </Text>
      </Pressable>
    </View>
  );
}
