import type { MockAnswerInput } from '../api/mock-attempts.types';

/** Sự kiện rời/vào app chưa gửi được (lỗi mạng) — gửi bù giữ NGUYÊN `clientEventId` (BE idempotent theo id). */
export interface PendingMockEvent {
  at: string;
  clientEventId: string;
  type: 'BACKGROUND' | 'FOREGROUND';
}

/** Trạng thái làm bài của MỘT lượt thi trên máy (app.md p4-02 §5). */
export interface MockPlayerEntry {
  answers: Record<string, MockAnswerInput>;
  currentIndex: number;
  events: PendingMockEvent[];
  flagged: string[];
  /** `itemId` chưa được server XÁC NHẬN — kể cả lô đang bay: chỉ gỡ khi PUT/submit trả 2xx. */
  pending: string[];
  updatedAt: number;
}
