import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { AvatarGroup } from '@/shared/ui/avatar-group';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { hapticTap } from '@/shared/utils/haptics';
import { useFeature } from '@/shell/capabilities';
import { useCallStore } from '../store/call.store';

import type { CallScopeType } from '../api/calls.types';
import { useStartCall } from '../hooks/useStartCall';
import { useActiveCallInScope } from '../queries/calls.queries';
import { CallErrorDialogs } from './CallErrorDialogs';

/**
 * Dải "Đang có cuộc gọi — Tham gia" trên cùng màn hội thoại/kênh (app.md p2-01 §3). Không có cuộc gọi, cờ `voice` tắt, mất
 * mạng, hoặc CHÍNH MÌNH đang ở trong cuộc gọi đó ⇒ không vẽ. Nút chỉ hiện khi server nói `myActions.canJoin` (client không tự
 * suy quyền). Dữ liệu cập nhật bằng socket (`useCallSignals` làm mới khoá `callKeys.active`).
 */
export function ActiveCallBanner({ scopeId, scopeType }: { scopeId: string; scopeType: CallScopeType }) {
  const enabled = useFeature('voice') === true;
  const offline = useConnectionState() === 'offline';
  const { data: call } = useActiveCallInScope(scopeType, scopeId, enabled && !offline);
  const myCallId = useCallStore((state) => (state.phase === 'idle' || state.phase === 'ended' ? null : state.callId));
  const { dismissFailure, failure, join, pending } = useStartCall();

  if (!enabled || offline || !call || call.status === 'ENDED' || call.id === myCallId) return null;

  const connected = call.participants.filter((p) => p.state === 'CONNECTED' || p.state === 'JOINING');
  const summary = `Đang gọi · ${String(connected.length)} người`;

  return (
    <View
      accessibilityLabel={`${summary}. ${call.myActions.canJoin ? 'Có thể tham gia.' : ''}`}
      className="flex-row items-center gap-sm bg-surface-success px-md py-xs"
    >
      {/* Icon điện thoại (trang trí — nghĩa ở chữ) + avatar chồng nhau (`AvatarGroup`, "+k" khi đông) thay cho ba avatar rời: dải
          đọc ra ngay là "cuộc gọi đang diễn ra với những người này". */}
      <Icon color="success" name="phone" size={18} variant="twotone" />
      <AvatarGroup
        max={3}
        size="xs"
        users={connected.map((p) => ({ avatarUrl: p.avatarUrl, id: p.userId, name: p.name }))}
      />
      <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
        {summary}
      </Text>
      {call.myActions.canJoin ? (
        <Button
          label="Tham gia"
          loading={pending}
          size="sm"
          onPress={() => {
            hapticTap(); // xác nhận cú chạm VÀO cuộc gọi — trước `join` (qua mạng, có thể trễ)
            void join(call.id);
          }}
        />
      ) : null}
      <CallErrorDialogs failure={failure} onClose={dismissFailure} />
    </View>
  );
}
