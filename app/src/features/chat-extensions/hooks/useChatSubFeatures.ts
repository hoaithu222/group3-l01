import { useMemo } from 'react';

import { useCapabilities, useFeature } from '@/shell/capabilities';

import { readChatExtLimits, type ChatExtLimits } from '../utils/chat-ext-limits';

export interface ChatSubFeatures {
  polls: boolean;
  scheduledMessages: boolean;
  messageReminders: boolean;
  messageToTask: boolean;
  messageToResource: boolean;
}

/**
 * Cờ phụ của tiện ích chat (`capabilities.features.<id>` — cùng danh sách phẳng với cờ phân hệ, BE `SUB_FEATURES`). Chỉ `true` khi BE báo BẬT: chưa tải xong capabilities
 * (`undefined`) hoặc BE cũ chưa có cờ ⇒ TẮT (DU-05: cờ tắt ⇒ ẩn hoàn toàn mục menu/banner, an toàn hơn hiện nhầm rồi nhận 404 `CFG_005`).
 *
 * `messageToTask`/`messageToResource` có phân hệ cha là `project` (không phải `communication` như ba cờ còn lại): BE tắt `project` ⇒ hai cờ này tự `enabled = false`, nên app không phải tự kiểm phân hệ cha.
 * ⚠️ KHÔNG có `gif`: mặc định tắt/chưa có nhà cung cấp (`capabilities.features.gif.available = false`), nên app không có mã cho tiện ích này thay vì có mã rồi giấu sau cờ.
 */
export function useChatSubFeatures(): ChatSubFeatures {
  const polls = useFeature('polls') === true;
  const scheduledMessages = useFeature('scheduledMessages') === true;
  const messageReminders = useFeature('messageReminders') === true;
  const messageToTask = useFeature('messageToTask') === true;
  const messageToResource = useFeature('messageToResource') === true;
  return useMemo(
    () => ({ polls, scheduledMessages, messageReminders, messageToTask, messageToResource }),
    [polls, scheduledMessages, messageReminders, messageToTask, messageToResource],
  );
}

/** `limits.poll|scheduledMessage|reminder` từ capabilities (có mặc định khi BE cũ chưa trả) — KHÔNG hard-code ở chỗ dùng. */
export function useChatExtLimits(): ChatExtLimits {
  const { data } = useCapabilities();
  const limits = data?.limits;
  return useMemo(() => readChatExtLimits(limits), [limits]);
}
