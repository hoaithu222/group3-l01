import type { ReactNode } from 'react';

import type { MessageView, ResolveChatAuthor } from '../../api/chat.types';

/**
 * Điểm MỞ RỘNG của tin hệ thống (`kind = SYSTEM`) cho module KHÁC mang thẻ riêng (vd `WALLET_REMINDER` của
 * ví nhóm, p6-04) mà KHÔNG để `chat` import ngược module đó — `chat` là feature NỀN (`feature-structure.md`
 * "Ngoại lệ: chat là feature NỀN"): nhận mọi thứ đặc thù qua đăng ký, không tự biết ai là consumer.
 *
 * Renderer là HÀM `(message) => ReactNode` chứ không phải component: tra một component từ registry ngay
 * lúc render bị `react-hooks/static-components` chặn ("tạo component trong lúc render" — mỗi lần vẽ là một
 * kiểu component mới trong mắt React, state con reset). Hàm trả phần tử thì `SystemLine` chỉ gọi nó, còn
 * component thật nằm ở module đăng ký. Nó tự vẽ CẢ dòng (chat không bọc thêm khung nào). `systemType`
 * không có renderer thì `SystemLine` rơi về đường cũ (`systemLineText` → `UnsupportedSystem`).
 *
 * ⚠️ Đăng ký ở NƠI LẮP RÁP (`app/(app)/_layout.tsx`), TRƯỚC khi danh sách tin nhắn vẽ lần đầu — đăng ký trong
 * effect của màn hình thì tin đầu tiên vẫn ra "Nội dung chưa hỗ trợ". Đăng ký lặp cùng loại là ghi đè
 * (idempotent, an toàn với Fast Refresh).
 *
 * `context` (tham số thứ hai, TUỲ CHỌN): thứ mà `SystemLine` đang có sẵn còn renderer ngoài thì không tự có được —
 * hiện là `resolveAuthor` (bộ tra `userId → tên` do màn cha đưa vào `ChatRoom`; `messages` chỉ mang userId thuần).
 * Thẻ nói về MỘT NGƯỜI (vd `MENTOR_JOINED` "Cố vấn … tham gia") cần nó để hiện tên như dòng `MEMBER_JOINED`.
 * Vắng mặt (người gọi cũ, test gọi renderer trực tiếp) ⇒ renderer phải chịu được, hiện câu không tên.
 */
export type SystemMessageRenderer = (message: MessageView, context?: SystemRendererContext) => ReactNode;

export interface SystemRendererContext {
  resolveAuthor?: ResolveChatAuthor;
}

const renderers = new Map<string, SystemMessageRenderer>();

export function registerSystemMessageRenderer(
  systemType: string,
  renderer: SystemMessageRenderer,
): void {
  renderers.set(systemType, renderer);
}

export function getSystemMessageRenderer(
  systemType: string | null,
): SystemMessageRenderer | undefined {
  return systemType === null ? undefined : renderers.get(systemType);
}
