import { router } from 'expo-router';
import { Keyboard } from 'react-native';

import { openMessage } from '@/shared/search';
import { showToast } from '@/shared/utils/toast.utils';

import type { ChannelHit, FileHit, MeetingHit, MessageHit, PersonHit } from '../api';

/**
 * Mở một kết quả — mỗi loại đi bằng ROUTE của phân hệ sở hữu nó (không import chéo feature). Màn tìm NẰM LẠI trong
 * ngăn xếp (`router.push`) nên Back về đúng từ khoá/tab/bộ lọc/vị trí cuộn, không cần lưu gì thêm.
 *
 * ⛔ Mọi hàm gọi `Keyboard.dismiss()` TRƯỚC khi điều hướng: ô tìm còn focus thì khi quay về từ tin, bàn phím bật lại ngay
 * (app.md p5-04 §7 "không tự mở bàn phím lại sau khi quay về từ tin").
 */

export function openMessageHit(workspaceId: string, hit: MessageHit): boolean {
  Keyboard.dismiss();
  return openMessage({
    scopeType: hit.scope.type,
    scopeId: hit.scope.id,
    workspaceId,
    messageId: hit.messageId,
    // `threadId`/`parentMessageId` cùng nghĩa: id TIN GỐC của luồng (không phải `Thread.id`).
    threadRootId: hit.threadId ?? hit.parentMessageId,
  });
}

/**
 * Tệp của kho tài liệu → màn xem trước tài liệu (p3-01); tệp của TIN → tin chứa nó (`?m=`). Tệp nằm trong reply của luồng
 * (`source.threadId` = id tin gốc) mở bằng màn LUỒNG của tin gốc — dòng chính của kênh không có reply nên sẽ không tìm thấy tin.
 */
export function openFileHit(workspaceId: string, hit: FileHit): boolean {
  Keyboard.dismiss();
  const { source } = hit;
  if (source.kind === 'RESOURCE' && source.resourceId) {
    router.push({
      pathname: '/workspaces/[wsId]/resources/preview/[resourceId]',
      params: { wsId: workspaceId, resourceId: source.resourceId },
    });
    return true;
  }
  if (source.kind === 'MESSAGE' && source.messageId && source.scope) {
    return openMessage({
      scopeType: source.scope.type,
      scopeId: source.scope.id,
      workspaceId,
      messageId: source.messageId,
      threadRootId: source.threadId,
    });
  }
  showToast('info', 'Không mở được tệp này.');
  return false;
}

/** Kênh ĐÃ tham gia → phòng chat; chưa tham gia → danh sách kênh (tab "Khám phá" xem trước + tham gia). */
export function openChannelHit(workspaceId: string, hit: ChannelHit): void {
  Keyboard.dismiss();
  if (hit.joined) {
    router.push({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: workspaceId, chId: hit.channelId },
    });
    return;
  }
  router.push({ pathname: '/workspaces/[wsId]/channels', params: { wsId: workspaceId } });
}

/**
 * Người → tin nhắn riêng bằng route của `conversations` (`/messages/new?userId=`): route tự chọn giữa hội thoại đã có và
 * màn nháp (D-16 kiểm điều kiện ở đó). Thẻ cá nhân của p1-02 là sheet cục bộ của `members`, không có route để đi tới.
 */
export function openPersonHit(hit: PersonHit): void {
  Keyboard.dismiss();
  router.push({
    pathname: '/messages/new',
    params: { userId: hit.userId, name: hit.displayName, avatarUrl: hit.avatarUrl ?? '' },
  });
}

export function openMeetingHit(hit: MeetingHit): void {
  Keyboard.dismiss();
  router.push({ pathname: '/meetings/[meetingId]', params: { meetingId: hit.meetingId } });
}

/**
 * "Chỉ trong kênh này" (app.md p5-04 §1): sang màn tìm TRONG MỘT kênh/nhóm chat của p1-09 (`features/discovery`) bằng route.
 * ⚠️ Màn đó không nhận từ khoá qua route, nên người dùng gõ lại — đổi lại là tìm sâu hơn (tin cũ, lọc luồng, realtime).
 */
export function openScopeSearch(
  workspaceId: string,
  scope: { id: string; type: 'CHANNEL' | 'CONVERSATION' },
): void {
  Keyboard.dismiss();
  if (scope.type === 'CHANNEL') {
    router.push({
      pathname: '/workspaces/[wsId]/channels/[chId]/search',
      params: { wsId: workspaceId, chId: scope.id },
    });
    return;
  }
  router.push({
    pathname: '/messages/[conversationId]/search',
    params: { conversationId: scope.id },
  });
}
