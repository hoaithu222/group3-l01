import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useMemo } from 'react';

import { meetingRoomKeys } from '../../api/meeting-room.keys';
import { meetingRoomService } from '../../api/meeting-room.service';
import type { AttendeeLite } from '../../api/meeting-room.types';

/** Số trang người được mời gom để dựng tên tác giả (mỗi trang ≤ 100 người) — họp lớn hơn thì người ngoài 400 đầu hiện "Thành viên". */
const ATTENDEE_PAGES = 4;
const FALLBACK_NAME = 'Thành viên';

/** Cùng hình dạng với `ResolveChatAuthor` của `@/features/chat` (khai lại để hook này không import chéo feature). */
export interface MeetingChatAuthor {
  avatarUrl?: string | null;
  name: string;
}

export interface MeetingChatData {
  /** Quyền gửi tin của MÌNH trong hội thoại họp (`myPermissions.canSend`); chưa biết ⇒ `false`. */
  canWrite: boolean;
  /** 404/403 khi đọc hội thoại — nhóm chat đã bị xoá hoặc mình không còn quyền ⇒ sheet tự đóng. */
  forbidden: boolean;
  /** Đang lấy quyền gửi tin (chưa dựng được `ChatRoom` vì `capabilities` chưa biết). */
  loading: boolean;
  readOnlyReason?: string;
  resolveAuthor: (userId: string) => MeetingChatAuthor;
}

async function loadAttendees(meetingId: string): Promise<AttendeeLite[]> {
  const all: AttendeeLite[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < ATTENDEE_PAGES; page += 1) {
    const result = await meetingRoomService.listAttendees(meetingId, cursor);
    all.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return all;
}

const isGone = (error: unknown): boolean =>
  isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403);

/**
 * Dữ liệu cho `MeetingChatSheet` (app.md p2-05 §3.2): quyền gửi tin (`chatAccess`) và bảng tên tác giả (`listAttendees`, gom ≤ 4 trang).
 * Hai truy vấn dùng `meetingRoomKeys.chatAccess` / `.attendees` — khoá `attendees` mang `AttendeeLite[]` (đã gom trang), nơi khác đọc
 * cùng khoá thì phải dùng CÙNG hình dạng này.
 *
 * `enabled = false` (sheet đóng / chưa có nhóm chat) ⇒ không gọi mạng. Lỗi tải danh sách người được mời KHÔNG chặn chat: tác giả chưa
 * biết tên thì hiện "Thành viên".
 */
export function useMeetingChatData(meetingId: string, conversationId: string | null, enabled: boolean): MeetingChatData {
  const active = enabled && conversationId !== null;
  const access = useQuery({
    enabled: active,
    queryFn: () => meetingRoomService.chatAccess(conversationId ?? ''),
    queryKey: meetingRoomKeys.chatAccess(conversationId ?? ''),
    retry: false,
    staleTime: 30_000,
  });
  const attendees = useQuery({
    enabled: active,
    queryFn: () => loadAttendees(meetingId),
    queryKey: meetingRoomKeys.attendees(meetingId),
    staleTime: 60_000,
  });

  const byId = useMemo(() => new Map((attendees.data ?? []).map((attendee) => [attendee.userId, attendee])), [attendees.data]);
  const resolveAuthor = useCallback(
    (userId: string): MeetingChatAuthor => {
      const attendee = byId.get(userId);
      return attendee ? { avatarUrl: attendee.avatarUrl, name: attendee.name || FALLBACK_NAME } : { name: FALLBACK_NAME };
    },
    [byId],
  );

  return {
    canWrite: access.data?.canSend ?? false,
    forbidden: access.isError && isGone(access.error),
    loading: active && access.isLoading,
    readOnlyReason: access.data?.readOnlyReason ?? undefined,
    resolveAuthor,
  };
}
