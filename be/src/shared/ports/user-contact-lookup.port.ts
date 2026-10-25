import type { ContactQuery } from "../../core/utils/contact-query";

/**
 * Cổng "tìm người theo email/số điện thoại" — MỘT nguồn sự thật cho mọi nơi cần tra một tài khoản bằng liên hệ ĐÃ BIẾT
 * (thêm thành viên vào nhóm làm việc, chọn người vào nhóm chat). Module tiêu thụ nhận instance qua constructor
 * (`createUserContactLookup()` của `@modules/users/public`) — KHÔNG tự query `User.email`/`User.phone`.
 *
 * Luật cố định của mọi bản cài đặt:
 *  - CHỈ khớp CHÍNH XÁC email (đã chuẩn hoá) hoặc số điện thoại (E.164) — không tiền tố/chứa, không tìm theo tên. Cho quét theo
 *    từng ký tự là biến ô tìm kiếm thành công cụ dò danh bạ (lộ ai có tài khoản).
 *  - CHỈ tài khoản `ACTIVE`, và không bao giờ trả chính người tra cứu.
 *  - Tôn trọng `User.privacy.findableByEmail/findableByPhone` (vắng ≡ cho phép): người đã tắt thì coi như KHÔNG tồn tại
 *    (trung tính — không phân biệt "không có tài khoản" với "không cho tìm").
 *  - Không trả email/số đầy đủ — chỉ gợi ý CHE (`hint`).
 */
export type ContactMatchBy = "EMAIL" | "PHONE";

export interface ContactMatch {
  userId: string;
  name: string;
  avatarUrl: string | null;
  matchedBy: ContactMatchBy;
  /**
   * Gợi ý CHE của liên hệ CÒN LẠI để người tra nhận ra đúng tài khoản: khớp SĐT → email che (`l***@gmail.com`); khớp email → SĐT che
   * (`+84 ****** 678`). `null` khi không có hoặc người đó không cho tìm bằng kênh kia.
   */
  hint: string | null;
}

export interface UserContactLookupPort {
  /** `TEXT` (không phải email/SĐT) → `[]`. Số điện thoại KHÔNG unique nên có thể trả nhiều tài khoản (tối đa `MAX_CONTACT_MATCHES`). */
  findByContact(query: ContactQuery, viewerId: string): Promise<ContactMatch[]>;
  /**
   * Tài khoản `ACTIVE` theo id (bước THÊM sau khi đã tra ra) — `null` khi không có/không còn hoạt động. KHÔNG kiểm cờ "cho tìm thấy": cờ
   * đó chỉ chi phối việc TÌM RA bằng email/SĐT, không phải thao tác theo id.
   */
  findActiveUser(userId: string): Promise<{ id: string; name: string } | null>;
}

/** Trần số tài khoản trả về cho MỘT lượt tra (SĐT dùng chung nhiều tài khoản là hiếm; chặn phình kết quả). */
export const MAX_CONTACT_MATCHES = 10;
