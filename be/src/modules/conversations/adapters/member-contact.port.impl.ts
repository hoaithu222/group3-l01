import { MODULES } from "../../../core/constants/modules";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { getLiveKit } from "../../../infrastructure/media";
import type { MemberContactAbility, MemberContactPort } from "../../../shared/ports/member-contact.port";
import { NO_CONTACT_ABILITY } from "../../../shared/ports/member-contact.port";
import { checkDirectEligibility } from "../services/eligibility.service";

/** Phân hệ gọi dùng được ngay: cờ `voice` runtime BẬT và máy chủ media đã cấu hình — cùng điều kiện `requireCallsEnabled` của `calls.routes.ts` (`CALL_012`). */
export async function callsAvailable(): Promise<boolean> {
  return (await runtimeConfig.isFeatureEnabled(MODULES.VOICE)) && getLiveKit().isConfigured();
}

/**
 * `MemberContactPort` — dùng ĐÚNG `checkDirectEligibility` (một nguồn sự thật D-16 với `POST /conversations/direct`, gửi tin 1-1, danh sách hội thoại)
 * nên thẻ thành viên không bao giờ hứa "Nhắn tin" mà bước tạo DM sau đó từ chối. `canCall` chỉ thêm điều kiện phân hệ gọi khả dụng (gọi 1-1 đi qua DM).
 * Lỗi hạ tầng khi tính cờ gọi → `canCall=false` (thẻ vẫn hiện, không 500).
 */
export class MemberContactPortImpl implements MemberContactPort {
  async evaluate(viewerId: string, targetUserId: string): Promise<MemberContactAbility> {
    const eligibility = await checkDirectEligibility(viewerId, targetUserId);
    if (!eligibility.canMessage) return { ...NO_CONTACT_ABILITY };
    const canCall = await callsAvailable().catch(() => false);
    return { canMessage: true, canCall };
  }
}
