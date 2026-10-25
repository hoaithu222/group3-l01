import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { CHANNEL_VOICE_ACTIVITY_EVENT, voiceActivityOf, type ChannelVoiceActivityPayload } from '@/shared/calls';

import type { ChannelDetail, ChannelListItem, ChannelListResponse } from '../api';
import { channelKeys } from '../queries/channels.keys';
import {
  applyChannelArchived,
  applyChannelCreated,
  mapChannelList,
  removeChannelFromList,
  type ChannelArchivedPayload,
} from './channel-socket.utils';

interface ChannelUpdatedPayload {
  v: number;
  id: string;
  name?: string;
  description?: string | null;
  postingPolicy?: 'MEMBERS' | 'ADMINS_ONLY';
  version: number;
}

interface ChannelGrantedPayload {
  channelId: string;
  workspaceId: string;
}

interface ChannelRevokedPayload {
  channelId: string;
  workspaceId: string;
}

/**
 * Đồng bộ cache theo `channel:*` (app.md p1-03 §4). Mount ở
 * `(app)/workspaces/[wsId]/_layout.tsx` — cùng tầng với `useWorkspaceSocket`
 * (p1-01), bọc quanh MỌI màn con kể cả danh sách kênh và bên trong một kênh.
 *
 * ⛔ KHÔNG điều hướng ở đây: hook này không biết đang đứng ở kênh nào (nếu có).
 * Điều hướng-ra-khi-mất-quyền-kênh-ĐANG-MỞ là việc của `useChannelScope`
 * (mount tại `[chId]/_layout.tsx`, nơi DUY NHẤT biết chắc "kênh này đang mở").
 */
export function useChannelSocket(wsId: string): void {
  const queryClient = useQueryClient();
  const listKey = channelKeys.list(wsId);

  useSocketEvent<{ v: number; channel: ChannelListItem }>(SocketEvent.CHANNEL_CREATED, (payload) => {
    queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
      prev ? applyChannelCreated(prev, payload.channel) : prev,
    );
  });

  useSocketEvent<ChannelUpdatedPayload>(SocketEvent.CHANNEL_UPDATED, (payload) => {
    const detailKey = channelKeys.detail(payload.id);
    const current = queryClient.getQueryData<ChannelDetail>(detailKey);
    if (current && payload.version > current.version) {
      queryClient.setQueryData<ChannelDetail>(detailKey, {
        ...current,
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.postingPolicy !== undefined && { postingPolicy: payload.postingPolicy }),
        version: payload.version,
      });
      // `postingPolicy` đổi ảnh hưởng `myPermissions.canWrite` — giá trị đó do
      // BE tính, refetch để lấy bản mới thay vì tự suy trên client (app.md §4).
      void queryClient.invalidateQueries({ queryKey: detailKey });
    }
    queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
      prev
        ? mapChannelList(prev, payload.id, (item) => ({
            ...item,
            ...(payload.name !== undefined && { name: payload.name }),
            ...(payload.postingPolicy !== undefined && { postingPolicy: payload.postingPolicy }),
          }))
        : prev,
    );
  });

  useSocketEvent<ChannelArchivedPayload>(SocketEvent.CHANNEL_ARCHIVED, (payload) => {
    const detailKey = channelKeys.detail(payload.id);
    const current = queryClient.getQueryData<ChannelDetail>(detailKey);
    if (current) {
      queryClient.setQueryData<ChannelDetail>(detailKey, { ...current, status: 'ARCHIVED', isDefault: false });
    }
    queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
      prev ? applyChannelArchived(prev, payload) : prev,
    );
  });

  // p2-03: số người trong phòng thoại của kênh VOICE (event RIÊNG, không phải `channel:activity` — xem `@/shared/calls/voice-activity`).
  useSocketEvent<ChannelVoiceActivityPayload>(CHANNEL_VOICE_ACTIVITY_EVENT, (payload) => {
    if (payload.workspaceId !== wsId) return;
    const voice = voiceActivityOf(payload.voice);
    queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
      prev ? mapChannelList(prev, payload.channelId, ({ voice: _old, ...item }) => (voice ? { ...item, voice } : item)) : prev,
    );
  });

  useSocketEvent<ChannelGrantedPayload>(SocketEvent.CHANNEL_GRANTED, (payload) => {
    if (payload.workspaceId !== wsId) return;
    void queryClient.invalidateQueries({ queryKey: listKey });
  });

  useSocketEvent<ChannelRevokedPayload>(SocketEvent.CHANNEL_REVOKED, (payload) => {
    if (payload.workspaceId !== wsId) return;
    queryClient.setQueryData<ChannelListResponse>(listKey, (prev) =>
      prev ? removeChannelFromList(prev, payload.channelId) : prev,
    );
    queryClient.removeQueries({ queryKey: channelKeys.detail(payload.channelId) });
    queryClient.removeQueries({ queryKey: ['channels', payload.channelId, 'members'] });
    queryClient.removeQueries({ queryKey: channelKeys.grants(payload.channelId) });
  });

  // ⚠️ KHÔNG nghe `channel:activity` để cộng chưa đọc ở đây nữa (bản "best-effort" cũ +1 mãi mà không bao giờ hạ về 0 khi đã đọc). Số chưa đọc
  // của danh sách kênh lấy từ `GET /me/unread?workspaceId=` (`withChannelUnread`), được `useReadStateSync` (shell) vá theo `channel:activity`
  // và `useReadMarker` hạ về 0 khi đọc.
}
