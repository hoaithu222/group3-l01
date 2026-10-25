/**
 * @file typing.service.ts
 * @description Trạng thái "đang gõ" (be.md p0-03 §5.5/README §2) — Redis TTL
 * thuần, KHÔNG lưu nội dung, KHÔNG qua Outbox (mất cũng không sao, đúng ghi
 * chú `reuse-first.md` về `outbox.add` "không dùng cho việc mất cũng không
 * sao (typing, presence)"). Module này chỉ lo bookkeeping Redis — phần phát
 * `typing` tới room (trừ người gửi, qua `socket.to()`) nằm ở
 * `handlers/typing.handler.ts` vì cần tham chiếu tới chính `socket` đang gửi.
 */
import { redis } from "../../infrastructure/redis";
import { LIMITS } from "../../core/constants/limits";

export type TypingScopeType = "CHANNEL" | "CONVERSATION";
export type TypingState = "start" | "stop";

export interface TypingInput {
  userId: string;
  scopeType: TypingScopeType;
  scopeId: string;
  threadId?: string;
}

/** `typing:{scopeType}:{scopeId}[:{threadId}]:{userId}` (be.md §4). */
function typingKey(input: TypingInput): string {
  const scopePart = input.threadId
    ? `${input.scopeType}:${input.scopeId}:${input.threadId}`
    : `${input.scopeType}:${input.scopeId}`;
  return `typing:${scopePart}:${input.userId}`;
}

/** `typing:start` → `SET ... EX 5`; `typing:stop` → `DEL` (be.md §5.5 bước 3). */
export async function setTyping(input: TypingInput, state: TypingState): Promise<void> {
  const key = typingKey(input);
  if (state === "start") {
    await redis.set(key, "1", LIMITS.message.typingTtlSeconds);
  } else {
    await redis.del(key);
  }
}
