import type { OfferMessageSide } from '../api/recruiter.types';

export type DeliveryState = 'FAILED' | 'SENDING';

/** Một dòng của thread: tin đã lưu trên server (`delivery` vắng) hoặc tin của tôi đang gửi / gửi lỗi (theo `clientMessageId`). */
export interface ThreadRow {
  content: string;
  createdAt: string;
  delivery?: DeliveryState;
  id: string;
  side: OfferMessageSide;
}

/** Tin của tôi chưa được server xác nhận. Không lưu xuống máy (app.md §4) — đóng màn là mất. */
export interface PendingMessage {
  clientMessageId: string;
  content: string;
  createdAt: string;
  delivery: DeliveryState;
  /** Lỗi do MẠNG (chưa tới server) ⇒ tự gửi lại khi có mạng; bị server từ chối thì chờ người dùng bấm "Gửi lại". */
  retryable: boolean;
}
