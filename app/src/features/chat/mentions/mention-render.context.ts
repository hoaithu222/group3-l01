import { createContext, useContext } from 'react';

export interface MentionRenderContextValue {
  /** userId → tên HIỆN TẠI (màn cha truyền qua `resolveAuthor`); thiếu thì chip dùng ảnh chụp tên lúc gửi. */
  resolveName?: (userId: string) => string | undefined;
  /** Nhắc tới CHÍNH MÌNH → chip có nền nổi bật (app.md p1-06 §3 `MentionChipText`). */
  currentUserId?: string;
  /** Chạm chip → màn cha mở thẻ người dùng nếu nó có cơ chế đó; không truyền thì chip không bấm được. */
  onPressMention?: (userId: string) => void;
}

/**
 * Ngữ cảnh dựng chip nhắc tên — `ChatRoom` cấp một lần, `TextContent` (sâu dưới `MessageBubble` →
 * `BubbleContent`) đọc, để KHÔNG phải luồn ba prop qua bốn tầng component. Không có provider
 * (vd `TextContent` dùng lẻ ở màn luồng) thì mọi giá trị `undefined`: chip vẫn hiện đúng
 * tên theo nhãn ảnh chụp, chỉ là không bấm được và không có nền "nhắc tới tôi".
 */
export const MentionRenderContext = createContext<MentionRenderContextValue>({});

export function useMentionRenderContext(): MentionRenderContextValue {
  return useContext(MentionRenderContext);
}
