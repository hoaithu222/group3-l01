import { router } from 'expo-router';

import type { MemberCard } from '../api';

/**
 * Có mở được tin nhắn riêng với người này không — hiện nút "Nhắn tin" ở thẻ.
 *
 * ⚠️ KHÔNG đọc `card.actions.canMessage`: BE (`member.presenter.ts#buildMemberActions`)
 * đang gán CỨNG `canMessage: false` cho MỌI thẻ ("phụ thuộc p1-05" từ lúc chưa có
 * hội thoại) — tin cờ đó thì nút không bao giờ hiện dù DM đã dựng xong. Điều kiện
 * thật (D-16: chung workspace ACTIVE, không bị chặn) đã được màn nháp DM kiểm
 * (`GET /conversations/direct/:userId` → `eligibility` → `ReadOnlyBar`), nên ở
 * đây chỉ loại hai ca chắc chắn vô nghĩa: chính mình, và người không còn ACTIVE
 * (bị chặn/đã rời). Khi BE tính `canMessage` thật thì đổi sang đọc cờ đó.
 */
export function canOpenDirectMessage(card: Pick<MemberCard, 'isMe' | 'status'>): boolean {
  return !card.isMe && card.status === 'ACTIVE';
}

/**
 * Mở/tạo tin nhắn riêng bằng ROUTE của `conversations` (`/messages/new?userId=`),
 * không import feature đó (`feature-structure.md`): route tự chọn giữa hội thoại
 * đã có (`router.replace` sang `/messages/[id]`) và màn nháp (chưa có → tạo lúc
 * gửi tin đầu, không sinh hội thoại rỗng). `name`/`avatarUrl` chỉ để vẽ header
 * màn nháp ngay khung hình đầu — dùng TÊN TÀI KHOẢN (`name`), không phải biệt
 * danh trong nhóm: hội thoại 1-1 luôn hiện tên người kia (`conversation-title.ts`).
 */
export function openDirectMessage(card: Pick<MemberCard, 'userId' | 'name' | 'avatarUrl'>): void {
  router.push({
    pathname: '/messages/new',
    params: { userId: card.userId, name: card.name, avatarUrl: card.avatarUrl ?? '' },
  });
}
