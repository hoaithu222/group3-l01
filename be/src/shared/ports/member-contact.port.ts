/**
 * Cổng "người xem liên hệ trực tiếp được thành viên này không" (p1-02 be.md §4 `MemberCard.actions`) — SERVER tính, client không tự suy.
 * Chủ sở hữu quy tắc là `modules/conversations` (điều kiện nhắn 1-1 D-16: chung nhóm ACTIVE + không chặn nhau + luật khách); module `members`
 * nhận instance qua constructor (`createMemberContactPort()` của `@modules/conversations/public`) — KHÔNG tự suy luận lại luật đó.
 */
export interface MemberContactAbility {
  /** Mở/gửi được tin 1-1 tới người này (`POST /conversations/direct`). */
  canMessage: boolean;
  /** Gọi trực tiếp được: `canMessage` VÀ phân hệ gọi (`voice`) đang bật + máy chủ media đã cấu hình. */
  canCall: boolean;
}

export const NO_CONTACT_ABILITY: MemberContactAbility = { canMessage: false, canCall: false };

export interface MemberContactPort {
  /** Người xem (`viewerId`) với `targetUserId` — người gọi hàm đã bảo đảm hai bên là thành viên ACTIVE của cùng một nhóm và khác nhau. */
  evaluate(viewerId: string, targetUserId: string): Promise<MemberContactAbility>;
}
