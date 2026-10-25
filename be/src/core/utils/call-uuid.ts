import { v5 as uuidv5 } from "uuid";
import { env } from "../config";

/**
 * `callId` (ObjectId 24 hex) → UUID v5 tất định (p2-02 be.md §5.4): `apns-id` của VoIP push, `data.callUuid` của push FCM, `CallDto.callUuid`
 * và `IncomingCallView.callUuid` — CallKit/ConnectionService dùng CHÍNH UUID này nên app không phải lưu bảng map `callId ↔ uuid` (tính lại được từ `callId`).
 * Namespace lấy từ `env.CALL_UUID_NAMESPACE` (mặc định = giá trị đã phát hành, không đổi UUID cũ) — ⛔ không đổi sau khi phát hành.
 * Module nào cần UUID cuộc gọi PHẢI dùng hàm này, không tự `uuidv5`.
 */
export function callIdToUuid(callId: string): string {
  return uuidv5(callId, env.CALL_UUID_NAMESPACE);
}
