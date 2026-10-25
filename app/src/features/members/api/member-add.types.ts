/**
 * `AVAILABLE` = thêm được ngay · `ALREADY_MEMBER` = đã ở trong nhóm · `BANNED` = đang bị chặn khỏi nhóm (phải bỏ chặn trước).
 */
export type MemberLookupState = 'AVAILABLE' | 'ALREADY_MEMBER' | 'BANNED';

/**
 * Một tài khoản tra ra bằng email/SĐT ĐẦY ĐỦ (`GET /workspaces/:id/member-lookup?q=`).
 *
 * ⛔ Không có email/SĐT đầy đủ của người được tìm thấy — BE chỉ trả `hint` CHE của liên hệ CÒN LẠI (khớp SĐT ⇒ email che
 * `l***@gmail.com`; khớp email ⇒ SĐT che `+84 ****** 678`) để người tra nhận ra đúng tài khoản. `null` khi không có hoặc người
 * đó không cho tìm bằng kênh kia.
 */
export interface MemberLookupItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  matchedBy: 'EMAIL' | 'PHONE';
  hint: string | null;
  state: MemberLookupState;
}

/** `POST /workspaces/:id/members` — `ALREADY_MEMBER` (HTTP 200) khi người đó đã ở trong nhóm (idempotent, không phải lỗi). */
export interface AddMemberResult {
  userId: string;
  state: 'ADDED' | 'ALREADY_MEMBER';
}
