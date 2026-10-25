/**
 * @file error.codes.ts
 * @description Centralised dictionary of all business / system error codes.
 *
 * Convention:  <DOMAIN>_<3-digit-sequence>
 *   AUTH_xxx  — Authentication & authorisation
 *   USER_xxx  — User-domain business rules
 *   VAL_xxx   — Input validation
 *   RES_xxx   — Resource / not-found errors
 *   RATE_xxx  — Rate-limiting
 *   OTP_xxx   — OTP (One-Time Password)
 *   SYS_xxx   — Infrastructure / unexpected errors
 */

export const ErrorCode = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  /** Email hoặc mật khẩu không đúng */
  AUTH_001: "AUTH_001",
  /** Token không hợp lệ */
  AUTH_002: "AUTH_002",
  /** Token đã hết hạn */
  AUTH_003: "AUTH_003",
  /** Token đã bị thu hồi (blacklisted) */
  AUTH_004: "AUTH_004",
  /** Không đủ quyền thực hiện hành động */
  AUTH_005: "AUTH_005",
  /** Refresh token không hợp lệ hoặc đã hết hạn */
  AUTH_006: "AUTH_006",
  /** Token đặt lại mật khẩu không hợp lệ */
  AUTH_008: "AUTH_008",
  /** Refresh token cookie không tồn tại */
  AUTH_009: "AUTH_009",
  /** Refresh token bị dùng lại — mọi phiên đã thu hồi */
  AUTH_010: "AUTH_010",
  /** Tài khoản đã bị khoá */
  AUTH_011: "AUTH_011",
  /** Tài khoản đang chờ xoá */
  AUTH_012: "AUTH_012",
  /** Không xác thực được bằng sinh trắc học */
  AUTH_013: "AUTH_013",
  /** Đăng nhập sinh trắc học trên thiết bị này đã bị vô hiệu */
  AUTH_014: "AUTH_014",
  /** Đăng nhập sinh trắc học đã hết hạn */
  AUTH_015: "AUTH_015",
  /** Đăng nhập sinh trắc học đang tạm tắt */
  AUTH_016: "AUTH_016",
  /** Thiếu thông tin nền tảng ứng dụng (X-Client-Platform) */
  AUTH_017: "AUTH_017",
  /** Mã nonce không hợp lệ, đã dùng hoặc đã hết hạn */
  AUTH_018: "AUTH_018",
  /** [xác minh email] Email của tài khoản đã được xác minh rồi (400 — `POST /auth/verify-email/send|confirm`; trước đây chung `VAL_001`) */
  AUTH_019: "AUTH_019",
  /** [xác minh email] Mã xác minh 6 chữ số sai hoặc đã hết hạn (400 — `POST /auth/verify-email/confirm`; trước đây chung `VAL_001`) */
  AUTH_020: "AUTH_020",
  /** Tự đổi mật khẩu/email của CHÍNH MÌNH qua `PATCH /users/:id` phải kèm `currentPassword` (400; sai mật khẩu hiện tại → 401 `AUTH_001`) */
  AUTH_021: "AUTH_021",
  /** [đăng nhập mạng xã hội] Firebase ID token không hợp lệ / hết hạn / đăng nhập cũ quá lâu (401 — `POST /auth/firebase-login`) */
  AUTH_022: "AUTH_022",
  /** [đăng nhập mạng xã hội] Tài khoản mạng xã hội không đủ điều kiện: thiếu email, email CHƯA xác minh, hoặc nhà cung cấp chưa được hỗ trợ (401) */
  AUTH_023: "AUTH_023",

  // ── Permission (p0-02 — access control theo scope) ─────────────────────────
  /** Không có quyền trong workspace */
  PERM_001: "PERM_001",
  /** Không có quyền với kênh */
  PERM_002: "PERM_002",
  /** Không có quyền với cuộc trò chuyện */
  PERM_003: "PERM_003",
  /** Không có quyền với cuộc họp */
  PERM_004: "PERM_004",
  /** Không ở trong cuộc gọi */
  PERM_005: "PERM_005",
  /** Vai trò không đủ để thực hiện thao tác (role hierarchy) */
  PERM_006: "PERM_006",
  /** Không tìm thấy scope hoặc không có quyền thấy (404 trung tính) */
  PERM_404: "PERM_404",

  // ── Realtime (p0-03 — mã ack Socket.IO, KHÔNG đi qua errorHandler HTTP) ─────
  /** Dữ liệu sự kiện không hợp lệ (Zod parse thất bại) */
  RT_400: "RT_400",
  /** Phiên kết nối không hợp lệ, vui lòng kết nối lại */
  RT_401: "RT_401",
  /** Không có kênh sự kiện này (kind lạ) */
  RT_404: "RT_404",
  /** Bạn chưa tham gia phòng này */
  RT_409: "RT_409",
  /** Dữ liệu sự kiện quá lớn */
  RT_413: "RT_413",
  /** Thao tác quá nhanh, thử lại sau */
  RT_429: "RT_429",

  // ── User ─────────────────────────────────────────────────────────────────────
  /** Không tìm thấy người dùng */
  USER_001: "USER_001",
  /** Email đã được sử dụng */
  USER_002: "USER_002",
  /** Dữ liệu người dùng không hợp lệ */
  USER_003: "USER_003",
  // NOTE: USER_004..USER_009 còn trống, để dành — p0-01 dùng tiếp từ USER_010
  // đúng bảng be.md §8 (p0-01/be.md), không lấp khoảng trống này.
  /** Còn là chủ sở hữu nhóm — phải chuyển quyền trước khi xoá tài khoản */
  USER_010: "USER_010",
  /** Tài khoản không ở trạng thái chờ xoá hoặc đã hết thời gian huỷ */
  USER_011: "USER_011",
  /** Ẩn danh hoá ngay lập tức (NOW) chỉ dành cho vai trò admin */
  USER_012: "USER_012",
  /** Email xác nhận không khớp email tài khoản mục tiêu */
  USER_013: "USER_013",
  /** Không thể tự xoá tài khoản của chính mình từ trang quản trị */
  USER_014: "USER_014",

  // ── Validation ───────────────────────────────────────────────────────────────
  /** Dữ liệu request không hợp lệ (body / query / params) */
  VAL_001: "VAL_001",

  // ── Resource ─────────────────────────────────────────────────────────────────
  /** Tài nguyên không tồn tại */
  RES_001: "RES_001",
  /** Tài nguyên đã tồn tại (conflict) */
  RES_002: "RES_002",
  /** Dữ liệu đã thay đổi (version) */
  RES_003: "RES_003",
  /** Yêu cầu trùng đang xử lý (idempotency) */
  RES_004: "RES_004",

  // ── Rate-limit ───────────────────────────────────────────────────────────────
  /** Quá nhiều request từ IP này */
  RATE_001: "RATE_001",
  /** Gửi quá nhanh */
  RATE_002: "RATE_002",
  /** Vượt giới hạn tác vụ theo giờ */
  RATE_003: "RATE_003",

  // ── Asset ────────────────────────────────────────────────────────────────────
  /** Loại tệp không được hỗ trợ */
  ASSET_001: "ASSET_001",
  /** Tệp vượt kích thước cho phép */
  ASSET_002: "ASSET_002",
  /** Tệp chưa sẵn sàng (chưa READY) */
  ASSET_003: "ASSET_003",
  /**
   * Bạn không thể thao tác với tệp này ở trạng thái hiện tại — dùng cho CẢ
   * "không phải chủ sở hữu" LẪN "sai trạng thái" (vd `complete`/`abort` một
   * asset không phải `UPLOADING`) trên các endpoint sở hữu-trực-tiếp
   * (`content`/`complete`/`upload-url`/`abort`). Đổi nghĩa so với bản trước
   * p0-05 (be.md §8) — trước đây message là "Tệp không thuộc phạm vi này".
   */
  ASSET_004: "ASSET_004",
  /**
   * Tệp không thuộc quyền sử dụng của bạn — dùng bởi `AssetLinkService.attach`
   * khi asset không phải của `actorId` và không được phép chuyển tiếp
   * (`allowForeignReadable`). Đổi nghĩa so với bản trước p0-05 (be.md §8) —
   * trước đây message là "Nội dung tệp không khớp loại khai báo" (giờ dùng
   * `ASSET_001`, xem `asset-processor.ts`).
   */
  ASSET_005: "ASSET_005",
  /** Ghi âm vượt quá thời lượng cho phép */
  ASSET_006: "ASSET_006",
  /** Chưa nhận được nội dung tệp trên storage, hãy tải lên lại */
  ASSET_007: "ASSET_007",
  /** Không có bản xem trước (thumbnail/poster) cho tệp này */
  ASSET_008: "ASSET_008",
  /** Liên kết tải tệp đã hết hạn */
  ASSET_009: "ASSET_009",
  /** Tệp đang được sử dụng nên không thể xoá */
  ASSET_010: "ASSET_010",

  // ── Devices (p0-06) ──────────────────────────────────────────────────────────
  /** Thông tin thiết bị không hợp lệ */
  DEVICE_001: "DEVICE_001",
  /** Không tìm thấy thiết bị */
  DEVICE_002: "DEVICE_002",

  // ── Push / Notifications (p0-06) ──────────────────────────────────────────────
  /** Dịch vụ thông báo đẩy chưa được cấu hình */
  PUSH_001: "PUSH_001",
  /** Người dùng chưa có thiết bị nhận thông báo */
  PUSH_002: "PUSH_002",
  /** Bộ lọc thông báo không hợp lệ */
  NOTI_001: "NOTI_001",
  /** Không tìm thấy thông báo */
  NOTI_002: "NOTI_002",
  /** Mốc thời gian không hợp lệ (p1-07 — `before` ở tương lai xa/đọc-tất-cả) */
  NOTI_003: "NOTI_003",
  /** Cài đặt thông báo không hợp lệ (p1-07 — vd trường chỉ ACCOUNT gửi kèm scope khác) */
  NOTI_004: "NOTI_004",

  // ── OTP ──────────────────────────────────────────────────────────────────────
  /**
   * OTP_001 — OTP không tìm thấy hoặc đã hết hạn.
   * HTTP: 400
   */
  OTP_001: "OTP_001",
  /**
   * OTP_002 — Mã OTP nhập vào không đúng.
   * HTTP: 400 — Response body có thêm { remainingAttempts: number }
   */
  OTP_002: "OTP_002",
  /**
   * OTP_003 — OTP bị khoá do nhập sai quá nhiều lần (mặc định: 5 lần).
   * HTTP: 400
   */
  OTP_003: "OTP_003",
  /**
   * OTP_004 — Đang trong thời gian chờ resend (cooldown 60 giây).
   * HTTP: 429 — Response body có thêm { cooldownSeconds: number }
   */
  OTP_004: "OTP_004",
  /**
   * OTP_005 — Vượt quá số lần gửi OTP cho phép trong 1 giờ (mặc định: 10 lần).
   * HTTP: 429
   */
  OTP_005: "OTP_005",

  // ── System config / feature flags (p0-07) ───────────────────────────────────
  /** Không tìm thấy khoá cấu hình trong registry */
  CFG_001: "CFG_001",
  /** Giá trị nằm ngoài giới hạn cho phép (floor/ceil) */
  CFG_002: "CFG_002",
  /** Không thể bật tính năng: phân hệ chưa sẵn sàng hoặc thiếu cấu hình hạ tầng */
  CFG_003: "CFG_003",
  /** Tính năng AI đang tạm dừng theo quyết định dự án (D-13) */
  CFG_004: "CFG_004",
  /** Tính năng chưa được bật */
  CFG_005: "CFG_005",

  // ── Job / Queue (p0-04) ──────────────────────────────────────────────────────
  /** Không tìm thấy job trong hàng đợi */
  JOB_001: "JOB_001",
  /** Job không ở trạng thái lỗi nên không thể chạy lại */
  JOB_002: "JOB_002",
  /** Sự kiện outbox không ở trạng thái thất bại */
  JOB_003: "JOB_003",
  // NOTE: JOB_004 (503 "Hàng đợi tạm thời không khả dụng") có trong be.md
  // nhưng KHÔNG có class AppError 503 sẵn trong hệ thống (chỉ 502
  // `BadGatewayError`) — thêm 1 status code mới cho đúng 1 mã lỗi hiếm gặp
  // (Redis/BullMQ down khi gọi admin API) không đáng giá trị so với việc phải
  // sửa `errorHandler`/hierachy. Cố tình bỏ qua, dùng `BadGatewayError`
  // (SYS_502) nếu tình huống này thật sự xảy ra — xem README/be.md ghi chú.

  // ── Workspaces (p1-01) ───────────────────────────────────────────────────────
  /** Tên nhóm không hợp lệ */
  WS_001: "WS_001",
  /** Nhóm đã được lưu trữ, không thể thay đổi */
  WS_002: "WS_002",
  /** Người nhận không còn là thành viên đang hoạt động */
  WS_003: "WS_003",
  /** Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm */
  WS_004: "WS_004",
  /** Tên xác nhận không khớp với người nhận */
  WS_005: "WS_005",
  /** Bạn đã tham gia số nhóm tối đa */
  WS_006: "WS_006",
  /** Nhóm đang hoạt động, không cần khôi phục */
  WS_007: "WS_007",
  /** Nhóm phải luôn có đúng một chủ sở hữu */
  WS_008: "WS_008",
  /** Nhóm bị lưu trữ bởi quản trị nền tảng, liên hệ hỗ trợ */
  WS_009: "WS_009",
  /** Không thể thay đổi vai trò chủ nhóm */
  WS_010: "WS_010",
  /** Bạn không đủ quyền thực hiện với thành viên này */
  WS_011: "WS_011",
  /** Không thể tự loại hoặc chặn chính mình */
  WS_012: "WS_012",
  /** Người này không còn là thành viên đang hoạt động */
  WS_013: "WS_013",
  /** Người này không bị chặn */
  WS_014: "WS_014",
  /** Không thể thu hồi chủ nhóm; hãy lưu trữ nhóm nếu cần */
  WS_015: "WS_015",
  /** Tên hiển thị không hợp lệ */
  WS_016: "WS_016",
  // p3-04 — duyệt tham gia / khách (be.md gọi WS_010..012; ĐÁNH SỐ LẠI vì WS_010..012 đã dùng ở p1-02 — D-28).
  /** [p3-04, be.md "WS_010"] Yêu cầu tham gia đang chờ quản trị nhóm duyệt (HTTP 202 trả trong `data.status`, KHÔNG phải lỗi) */
  WS_017: "WS_017",
  /** [p3-04, be.md "WS_011"] Nhóm chưa bật mời khách hoặc đã đủ số khách (409) */
  WS_018: "WS_018",
  /** [p3-04, be.md "WS_012"] Bạn vừa bị từ chối, hãy thử lại sau — xin lại được sau 24 giờ (429) */
  WS_019: "WS_019",

  // ── Members / Invites (p1-02) ─────────────────────────────────────────────────
  /** Lời mời đã hết hạn */
  INV_001: "INV_001",
  /** Lời mời đã hết lượt sử dụng */
  INV_002: "INV_002",
  /** Lời mời đã bị thu hồi */
  INV_003: "INV_003",
  /** Bạn không thể tham gia nhóm này */
  INV_004: "INV_004",
  /** Nhóm đã được lưu trữ */
  INV_005: "INV_005",
  /** Nhóm đã có quá nhiều lời mời đang hoạt động */
  INV_006: "INV_006",
  /** Lời mời không hợp lệ */
  INV_007: "INV_007",
  // p3-04 — lời mời đích danh theo email (be.md gọi INV_006..009; ĐÁNH SỐ LẠI vì INV_006/007 đã dùng ở p1-02 — D-28).
  /** [p3-04, be.md "INV_006"] Lời mời dành cho email khác hoặc email chưa xác minh (403, details.reason EMAIL_MISMATCH|EMAIL_NOT_VERIFIED) */
  INV_008: "INV_008",
  /** [p3-04, be.md "INV_007"] Liên kết mời (InviteLink) không thể dùng để mời khách (400) */
  INV_009: "INV_009",
  /** [p3-04, be.md "INV_008"] Lời mời đã hết hạn hoặc đã bị thu hồi (410) */
  INV_010: "INV_010",
  /** [p3-04, be.md "INV_009"] Người này đã là thành viên của nhóm (409) */
  INV_011: "INV_011",

  // ── Channels (p1-03) ─────────────────────────────────────────────────────────
  /** Tên kênh đã tồn tại trong nhóm */
  CH_001: "CH_001",
  /** Tên kênh không hợp lệ */
  CH_002: "CH_002",
  /** Kênh phải còn ít nhất một người quản lý */
  CH_003: "CH_003",
  /** Kênh đã được lưu trữ, không thể thay đổi */
  CH_004: "CH_004",
  /** Cần chọn kênh công khai đang hoạt động khác làm kênh mặc định */
  CH_005: "CH_005",
  /** Nhóm đã có số kênh tối đa */
  CH_006: "CH_006",
  /** Kênh này không thể khôi phục bằng thao tác thường */
  CH_007: "CH_007",
  /** Thao tác không áp dụng cho loại hiển thị của kênh */
  CH_008: "CH_008",
  /** Không thể rời kênh mặc định */
  CH_009: "CH_009",
  /** Loại kênh này chưa được bật */
  CH_010: "CH_010",
  /** Có người được chọn không còn là thành viên nhóm */
  CH_011: "CH_011",
  /** Không thao tác cấp nền tảng trên kênh riêng tư */
  CH_012: "CH_012",
  /** [p3-04, be.md "CH_009"] Chỉ được chỉ định kênh riêng tư mà bạn quản lý (403) — ĐÁNH SỐ LẠI vì CH_009 đã dùng ở p1-03 (D-28) */
  CH_013: "CH_013",

  // ── Messages (p1-04) ─────────────────────────────────────────────────────────
  /** Tin nhắn vượt quá 4.000 ký tự */
  MSG_001: "MSG_001",
  /** Mỗi tin tối đa 5 tệp đính kèm */
  MSG_002: "MSG_002",
  /** Đã quá thời gian cho phép sửa tin nhắn */
  MSG_003: "MSG_003",
  /** Bạn không thể gửi tin nhắn ở đây */
  MSG_004: "MSG_004",
  /** Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ */
  MSG_005: "MSG_005",
  /** Tin nhắn đã bị thu hồi */
  MSG_006: "MSG_006",
  /** Tin nhắn trống */
  MSG_007: "MSG_007",
  /** Nhắc tên không hợp lệ */
  MSG_008: "MSG_008",
  /** Chỉ người gửi mới sửa được tin nhắn này */
  MSG_009: "MSG_009",
  /** Đã đạt số tin ghim tối đa, hãy bỏ ghim một tin cũ */
  MSG_010: "MSG_010",
  /** Tin nhắn thoại dài quá 5 phút */
  MSG_011: "MSG_011",
  /** Không tìm thấy tin nhắn trong cuộc trò chuyện này */
  MSG_012: "MSG_012",
  /** Biểu tượng cảm xúc không hợp lệ */
  MSG_013: "MSG_013",
  /** Tin nhắn đã có quá nhiều loại cảm xúc */
  MSG_014: "MSG_014",
  /** Không thể chuyển tiếp tin nhắn này */
  MSG_015: "MSG_015",
  /**
   * Không thể xem trước liên kết này. [P1] — dự phòng cho `link.preview`
   * (be.md §5.9) hiện chưa build; giữ mã để `error.codes.ts` khớp be.md §8
   * đầy đủ, chưa có endpoint nào ném mã này ở vòng p1-04.
   */
  MSG_016: "MSG_016",
  /**
   * Đích chuyển tiếp là `{directUserId}` nhưng `ConversationHooks`
   * (`core/permission/conversation-hooks.port.ts`, cài đặt bởi p1-05
   * `modules/conversations`) CHƯA được đăng ký trong tiến trình hiện tại
   * (vd script/test không boot đủ `router.ts`) — không thể `getOrCreateDirect()`.
   * p1-05 ĐÃ build (2026-09-18) và đăng ký hook lúc `router.ts` gọi
   * `registerConversationModule()`; mã này giờ là fallback an toàn cho
   * trường hợp hook chưa sẵn sàng, không còn là "p1-05 chưa tồn tại" như
   * trước — giữ nguyên mã (không đổi số) để không phá vỡ hợp đồng lỗi hiện có.
   */
  MSG_017: "MSG_017",
  /**
   * p1-06 be.md §8 — be.md đặc tả gọi mã này là "MSG_017" nhưng `MSG_017` ĐÃ
   * bị p1-05 (`message-forward.service.ts`) chiếm cho một nghiệp vụ khác
   * (xem docstring `MSG_017` ở trên) — đánh số lại từ mã `MSG_0xx` trống tiếp
   * theo (`MSG_018`) thay vì đổi lại `MSG_017` cũ (phá hợp đồng lỗi hiện có).
   * Ý nghĩa be.md: "Cuộc trò chuyện này không hỗ trợ luồng trả lời" —
   * `threadRootId` gửi vào hội thoại (CONVERSATION), chỉ CHANNEL có thread.
   */
  MSG_018: "MSG_018",
  /** p1-06 be.md §8 (be.md gọi "MSG_018") — "Không thể tạo luồng trong một luồng": `threadRootId` trỏ tới 1 tin đã là reply (root.threadId != null). */
  MSG_019: "MSG_019",
  /** p1-06 be.md §8 (be.md gọi "MSG_019") — "Bạn không được nhắc tất cả thành viên ở đây": `@all` ở kênh/DIRECT, hoặc vai trò actor < `settings.mentionAllRole` trong nhóm chat. */
  MSG_020: "MSG_020",
  /** p1-06 be.md §8 (be.md gọi "MSG_020") — "Bạn đã nhắc tất cả quá nhiều lần, thử lại sau": vượt rate limit `@all` (5 lần/giờ/người/nhóm). */
  MSG_021: "MSG_021",

  // ── Conversations (p1-05) ───────────────────────────────────────────────────
  /** Bạn chỉ nhắn tin được với người cùng nhóm */
  CONV_001: "CONV_001",
  /** Không thể gửi tin nhắn cho người này (đã bị chặn) */
  CONV_002: "CONV_002",
  /** Có người không thuộc nhóm làm việc này */
  CONV_003: "CONV_003",
  /** Nhóm chat đã đạt số thành viên tối đa */
  CONV_004: "CONV_004",
  /** Chủ nhóm cần chuyển quyền trước khi rời */
  CONV_005: "CONV_005",
  /** Bạn không thể thao tác với người có vai trò ngang hoặc cao hơn */
  CONV_006: "CONV_006",
  /** Cuộc trò chuyện đã giải tán hoặc lưu trữ */
  CONV_007: "CONV_007",
  /** Không thể rời cuộc trò chuyện 1-1 */
  CONV_008: "CONV_008",
  /** Bạn chỉ ghim được tối đa 20 cuộc trò chuyện */
  CONV_009: "CONV_009",
  /** Tên nhóm phải từ 1 đến 80 ký tự */
  CONV_010: "CONV_010",
  /** Không thể tạo cuộc trò chuyện với chính bạn */
  CONV_011: "CONV_011",
  /** Thành viên nhóm này do cuộc họp quản lý */
  CONV_012: "CONV_012",
  /** Chưa có cuộc trò chuyện với người này */
  CONV_013: "CONV_013",
  /** [p3-04, be.md "CV_010"/"CV_00x" — prefix thật là CONV_] Khách (GUEST) nhắn 1-1 người không chung kênh chỉ định/nhóm chat — thông điệp trung tính (403) */
  CONV_014: "CONV_014",
  /** [p3-04, foundation bổ sung — be.md thiếu mã] Thêm khách vào nhóm chat chưa bật `allowGuests` (403) */
  CONV_015: "CONV_015",

  // ── Moderation / Reports (p1-08) ─────────────────────────────────────────────
  /** Báo cáo này đã được xử lý (409) */
  MOD_001: "MOD_001",
  /** Không tìm thấy nội dung để báo cáo (404 — không phân biệt "không tồn tại" và "không quyền") */
  MOD_002: "MOD_002",
  /** Hành động không áp dụng cho loại báo cáo này (400) */
  MOD_003: "MOD_003",
  /** Không có quyền xem nội dung này (403 — không phải đích tin nhắn / không thuộc luồng D-06) */
  MOD_004: "MOD_004",
  /** Quyền xem nội dung đã hết hạn (403 — sau `privateViewGraceHours` kể từ khi đóng báo cáo) */
  MOD_005: "MOD_005",
  /** Bạn gửi báo cáo quá nhiều, thử lại sau (429 — `scopeLimiter("report")`) */
  MOD_006: "MOD_006",

  // ── Blocks (p1-08) ───────────────────────────────────────────────────────────
  /** Không thể thực hiện với chính bạn (400) */
  BLOCK_001: "BLOCK_001",
  /** Không thể gửi tin cho người này (403 — trung tính, không nói "bị chặn"). Dành cho `BlockPort` consumer chưa có mã riêng (gọi p2-01, chuyển tiếp...). */
  BLOCK_002: "BLOCK_002",
  /** Không thể thêm người này (403 — trung tính; người thêm bị target chặn) */
  BLOCK_003: "BLOCK_003",
  /** Bạn đã chặn số người tối đa (409) */
  BLOCK_004: "BLOCK_004",

  // ── Discovery — tìm trong kênh/hội thoại + tin đã lưu (p1-09) ────────────────
  // ⚠ p5-04 be.md §8 (tìm toàn workspace, chưa build) cũng khai `SRCH_001..004` với nghĩa KHÁC
  // (SRCH_002 = 404, SRCH_003 = 403, SRCH_004 = 422) — p5-04 đã đánh số lại từ SRCH_101 (xem khối "Workspace search" bên dưới).
  /** Từ khoá tìm kiếm cần từ 2 đến 100 ký tự (400) */
  SRCH_001: "SRCH_001",
  /** Từ khoá có quá nhiều từ, hãy rút gọn (400) */
  SRCH_002: "SRCH_002",
  /** Phạm vi này không hỗ trợ tìm kiếm (400) */
  SRCH_003: "SRCH_003",
  /** Bạn đã lưu số tin nhắn tối đa, hãy bỏ lưu bớt (409) */
  SRCH_004: "SRCH_004",

  // ── Workspace search / templates / announcements (p5-04) ─────────────────────
  // ⚠ be.md p5-04 §8 ghi `SRCH_001..004` nhưng dải đó đã dùng cho p1-09 (nghĩa khác) → tìm toàn workspace đánh số lại từ SRCH_101.
  /** Từ khoá tìm kiếm phải từ 2 đến 100 ký tự (400) */
  SRCH_101: "SRCH_101",
  /** Không tìm thấy phạm vi tìm kiếm (404 trung tính — kênh/hội thoại lọc không đọc được) */
  SRCH_102: "SRCH_102",
  /** Bạn không thể tìm thành viên trong nhóm này (403 — khách) */
  SRCH_103: "SRCH_103",
  /** Tìm kiếm quá rộng, hãy thêm bộ lọc hoặc thu hẹp thời gian (422 — hết `maxTimeMs` mà chưa có kết quả) */
  SRCH_104: "SRCH_104",
  /** Mẫu nhóm không tồn tại hoặc đã tắt (404) */
  TPL_001: "TPL_001",
  /** Không thể áp mẫu cho nhóm đã lưu trữ (409) */
  TPL_002: "TPL_002",
  /** Nhóm đã đạt số kênh tối đa (409) */
  TPL_003: "TPL_003",
  /** Chỉ kênh thông báo (chỉ quản trị được đăng) mới yêu cầu xác nhận đã đọc (400) */
  ANN_001: "ANN_001",
  /** Kênh đang có quá nhiều thông báo cần xác nhận (409) */
  ANN_002: "ANN_002",
  /** Yêu cầu xác nhận đã bị huỷ hoặc hết hạn (410) */
  ANN_003: "ANN_003",

  // ── Resources — kho tài liệu (p3-01) ─────────────────────────────────────────
  // Mã theo p3-01 be.md §8. `p7-04` be.md dùng lại `RSC_003`.
  /** Thư mục vượt quá số cấp cho phép (400) */
  RSC_001: "RSC_001",
  /** Đã có thư mục cùng tên ở vị trí này (409) */
  RSC_002: "RSC_002",
  /** Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu (400) */
  RSC_003: "RSC_003",
  /** Thư mục còn nội dung, hãy xoá hoặc di chuyển nội dung trước (409) */
  RSC_004: "RSC_004",
  /** Tệp này chưa có bản xem trước (409, details.convertible?) */
  RSC_005: "RSC_005",
  /** Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó (400) */
  RSC_006: "RSC_006",
  /** Kho tài liệu của nhóm đã đầy dung lượng (413) */
  RSC_007: "RSC_007",
  /** Không thể khôi phục vì vị trí gốc không còn (409) */
  RSC_008: "RSC_008",

  // ── Study — bộ học & flashcard (p4-01) ───────────────────────────────────────
  // Mã theo p4-01 be.md §8. `STUDY_001` là mã CHUNG cho mọi lỗi mục học khi lưu hàng loạt (mỗi lỗi có `details[].code`,
  // vd `STUDY_005`/`STUDY_006`); `STUDY_005`/`STUDY_006` cũng là mã chi tiết trong `details`, không phải mã lỗi cấp trên.
  /** Một số mục học chưa hợp lệ (400, details: [{ index, clientItemKey, field, code }]) */
  STUDY_001: "STUDY_001",
  /** Bộ học đã đạt số mục tối đa (409) */
  STUDY_002: "STUDY_002",
  /** Bộ học dùng trong nhóm phải chọn nhóm (400) */
  STUDY_003: "STUDY_003",
  /** Bộ học đã bị ẩn (409) */
  STUDY_004: "STUDY_004",
  /** Đáp án đúng không nằm trong các lựa chọn (400 — mã chi tiết của STUDY_001) */
  STUDY_005: "STUDY_005",
  /** Ảnh hoặc âm thanh chưa sẵn sàng (400 — mã chi tiết của STUDY_001) */
  STUDY_006: "STUDY_006",
  /** Bạn đã đạt số bộ học tối đa (409) */
  STUDY_007: "STUDY_007",
  /** Cần xác nhận trước khi công khai bộ học (400) */
  STUDY_008: "STUDY_008",

  // ── Study — thi thử & ôn tập ngắt quãng (p4-02) ──────────────────────────────
  /** Bộ học chưa có câu hỏi chấm điểm được để thi thử (409) */
  MOCK_001: "MOCK_001",
  /** Bạn đang có bài thi dở của bộ học này (409, details: { attemptId }) */
  MOCK_002: "MOCK_002",
  /** Đã hết thời gian làm bài (409) */
  MOCK_003: "MOCK_003",
  /** Bài thi đã được nộp (409) */
  MOCK_004: "MOCK_004",
  /** Câu trả lời không thuộc đề thi (400) */
  MOCK_005: "MOCK_005",
  /** Bạn đã thi thử bộ học này quá số lần cho phép hôm nay (429) */
  MOCK_006: "MOCK_006",
  /** Thẻ này đang tạm ngừng ôn tập (409) */
  SR_001: "SR_001",
  /** Bộ học chưa có mục nào để ôn tập (409) */
  SR_002: "SR_002",
  /** Bạn đã ôn quá số thẻ cho phép trong ngày (429) */
  SR_003: "SR_003",

  // ── Gamification — XP, cấp độ, huy hiệu (p4-03) ──────────────────────────────
  /** Không tìm thấy luật điểm kinh nghiệm (404) */
  GAME_001: "GAME_001",
  /** Điều kiện mở huy hiệu không hợp lệ (400) */
  GAME_002: "GAME_002",
  /** Mã huy hiệu đã tồn tại (409) */
  GAME_003: "GAME_003",
  /** Mức điều chỉnh điểm kinh nghiệm vượt giới hạn cho phép (400) */
  GAME_004: "GAME_004",
  /** Cấu hình cấp độ không hợp lệ (400) */
  GAME_005: "GAME_005",
  /** Chỉ trưng bày được huy hiệu bạn đã đạt, tối đa 6 huy hiệu (400) */
  GAME_006: "GAME_006",

  // ── Projects — bảng công việc + chi tiết thẻ (p3-02, p3-03) ──────────────────
  // Mã theo p3-02/p3-03 be.md §8. TASK_005, TASK_006 và TASK_017..TASK_021 DÀNH CHO p4-04
  // (phụ thuộc/dời lịch) — KHÔNG dùng cho việc khác. TASK_002 do p3-02 khai nhưng p4-05 mới dùng.
  /** [p3-02] Cột không tồn tại trên bảng này (400) */
  TASK_001: "TASK_001",
  /** [p3-02 khai, p4-05 dùng] Thẻ chưa đủ điều kiện để hoàn thành (409) */
  TASK_002: "TASK_002",
  /** [p3-03] Checklist đã đạt số mục tối đa (409) */
  TASK_003: "TASK_003",
  /** [p3-03] Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ (400) */
  TASK_004: "TASK_004",
  /** [p3-02] Cột còn thẻ, hãy chuyển thẻ trước khi xoá cột (409, details.taskCount) */
  TASK_007: "TASK_007",
  /** [p3-02] Bảng phải có đúng một cột Hoàn thành và không đổi loại cột đang có thẻ (400) */
  TASK_008: "TASK_008",
  /** [p3-02] Nhóm đã đạt số bảng tối đa (409) */
  TASK_009: "TASK_009",
  /** [p3-02] Bảng đã đạt số thẻ tối đa (409) */
  TASK_010: "TASK_010",
  /** [p3-02] Bảng đã đạt số nhãn tối đa (409) */
  TASK_011: "TASK_011",
  /** [p3-03] Thẻ đã đạt số tệp đính kèm tối đa (409) */
  TASK_012: "TASK_012",
  /** [p3-03; p4-04 dùng lại] Ngày bắt đầu phải trước hạn chót (400) */
  TASK_013: "TASK_013",
  /** [p3-03] Có người được nhắc tên không thuộc nhóm (400, details.invalidMentions) */
  TASK_014: "TASK_014",
  /** [p3-03] Đã quá thời gian cho phép sửa bình luận (409) */
  TASK_015: "TASK_015",
  /** [p3-03] Thẻ đã xoá quá lâu, không thể khôi phục (410) */
  TASK_016: "TASK_016",
  /** [p4-04] Không thể tạo phụ thuộc vòng giữa các thẻ (409, details.cycle) */
  TASK_005: "TASK_005",
  /** [p4-04] Đổi hạn này sẽ dời lịch các thẻ phía sau, vui lòng xác nhận (409, details.preview) */
  TASK_006: "TASK_006",
  /** [p4-04] Phụ thuộc không hợp lệ: hai thẻ phải khác nhau, cùng bảng và chưa bị xoá (400) */
  TASK_017: "TASK_017",
  /** [p4-04] Thẻ đã đạt số phụ thuộc tối đa (409) */
  TASK_018: "TASK_018",
  /** [p4-04] Lịch các thẻ đã thay đổi, vui lòng xem lại trước khi dời (409, details.preview) */
  TASK_019: "TASK_019",
  /** [p4-04] Bảng đang có một lần dời lịch khác (409) */
  TASK_020: "TASK_020",
  /** [p4-04] Chuỗi phụ thuộc quá lớn để xử lý (409) */
  TASK_021: "TASK_021",

  // ── Peer review — chấm chéo (p4-05) ──────────────────────────────────────────
  // Chặn kéo sang DONE khi chưa đủ duyệt dùng `TASK_002` với `details.reason = "REVIEW_REQUIRED"` (p3-02 khai).
  /** [p4-05] Lượt chấm đã đóng hoặc bạn không còn được giao chấm thẻ này (409) */
  REVIEW_001: "REVIEW_001",
  /** [p4-05] Điểm chấm không khớp tiêu chí đánh giá (400, details) */
  REVIEW_002: "REVIEW_002",
  /** [p4-05] Bạn đang là người thực hiện thẻ này nên không thể tự chấm (409) */
  REVIEW_003: "REVIEW_003",
  /** [p4-05] Cấu hình chấm chéo không hợp lệ (400, details) */
  REVIEW_004: "REVIEW_004",
  /** [p4-05] Không có thành viên phù hợp để giao chấm (409) */
  REVIEW_005: "REVIEW_005",
  /** [p4-05] Vui lòng ghi nhận xét khi yêu cầu sửa (400, details.feedback) */
  REVIEW_006: "REVIEW_006",
  /** [p4-05] Thẻ không có lượt chấm đang mở (409) */
  REVIEW_007: "REVIEW_007",

  // ── Báo cáo đóng góp & heatmap (p4-06) ────────────────────────────────────────
  /** [p4-06] Bảng đóng góp chỉ để xem, không thể chỉnh sửa (405, header Allow: GET) */
  CONTRIB_001: "CONTRIB_001",
  /** [p4-06] Tổng trọng số phải bằng 100 (400) */
  CONTRIB_002: "CONTRIB_002",
  /** [p4-06] Kỳ báo cáo không hợp lệ (400) */
  CONTRIB_003: "CONTRIB_003",
  /** [p4-06] Khoảng ngày của biểu đồ hoạt động vượt giới hạn cho phép (400) */
  CONTRIB_004: "CONTRIB_004",
  /** [p4-06] Tệp báo cáo đã hết hạn, vui lòng xuất lại (410) */
  CONTRIB_005: "CONTRIB_005",
  /** [p4-06] Báo cáo đang được tạo, vui lòng chờ (409) */
  CONTRIB_006: "CONTRIB_006",

  // ── Huy hiệu kỹ năng xác thực (p6-06) ─────────────────────────────────────────
  /** [p6-06] Mã kỹ năng đã tồn tại (409) */
  SKILL_001: "SKILL_001",
  /** [p6-06] Tiêu chí kỹ năng không hợp lệ (400) */
  SKILL_002: "SKILL_002",
  /** [p6-06] Người dùng chưa có huy hiệu kỹ năng này (404) */
  SKILL_003: "SKILL_003",
  /** [p6-06] Huy hiệu chưa bị thu hồi (409) */
  SKILL_004: "SKILL_004",
  /** [p6-06] Đã đạt số kỹ năng tối đa (409) */
  SKILL_005: "SKILL_005",
  /** [p6-06] Vừa chạy đánh giá lại gần đây (429, details.retryAfterSeconds) */
  SKILL_006: "SKILL_006",

  // ── Wallet (p6-04) ────────────────────────────────────────────────────────────
  /** [p6-04] Người tham gia không thuộc nhóm (400, details.invalidUserIds) */
  WALLET_001: "WALLET_001",
  /** [p6-04] Tổng số tiền chia không khớp (400) */
  WALLET_002: "WALLET_002",
  /** [p6-04] Ảnh hoá đơn/chứng từ chưa sẵn sàng (400) */
  WALLET_003: "WALLET_003",
  /** [p6-04] Khoản chi đã có người thanh toán, hãy tạo khoản điều chỉnh (409) */
  WALLET_004: "WALLET_004",
  /** [p6-04] Số tiền vượt quá khoản nợ hiện tại (400) */
  WALLET_005: "WALLET_005",
  /** [p6-04] Không thể trả tiền cho chính mình (400) */
  WALLET_006: "WALLET_006",
  /** [p6-04] Giao dịch không còn ở trạng thái chờ xác nhận (409) */
  WALLET_007: "WALLET_007",
  /** [p6-04] Nơi nhận nhắc nợ không hợp lệ (400) */
  WALLET_008: "WALLET_008",
  /** [p6-04] Đã đạt số tài khoản nhận tiền tối đa (409) */
  WALLET_009: "WALLET_009",
  /** [p6-04] Vừa nhắc nợ gần đây, thử lại sau (429) */
  WALLET_010: "WALLET_010",

  // ── Mentor Connect (p6-03) ─────────────────────────────────────────────────────
  /** [p6-03] Nhóm đã có tối đa số bài tìm cố vấn đang mở (409) */
  MENTOR_001: "MENTOR_001",
  /** [p6-03] Bài đăng không còn nhận ứng tuyển (409) */
  MENTOR_002: "MENTOR_002",
  /** [p6-03] Bạn đã ứng tuyển bài này (409) */
  MENTOR_003: "MENTOR_003",
  /** [p6-03] Đã là thành viên hoặc không thể tham gia nhóm này (400) */
  MENTOR_004: "MENTOR_004",
  /** [p6-03] Bài đã đủ cố vấn hoặc vừa thay đổi (409) */
  MENTOR_005: "MENTOR_005",
  /** [p6-03] Quá nhiều đơn đang chờ (429) */
  MENTOR_006: "MENTOR_006",
  /** [p6-03] Tổng thời gian cố vấn vượt giới hạn (400) */
  MENTOR_007: "MENTOR_007",
  /** [p6-03] Kênh được chọn không hợp lệ (400, details.channelIds) */
  MENTOR_008: "MENTOR_008",
  /** [p6-03] Đợt cố vấn đã kết thúc (409) */
  MENTOR_009: "MENTOR_009",
  /** [p6-03] Đơn ứng tuyển không còn ở trạng thái chờ (409) */
  MENTOR_010: "MENTOR_010",

  // ── O2O — in ấn & địa điểm (p6-05 be.md §8) ──────────────────────────────────
  /** [p6-05] Tiệm hiện không nhận đơn (409) */
  O2O_001: "O2O_001",
  /** [p6-05] Tiệm không hỗ trợ cấu hình in đã chọn (400) */
  O2O_002: "O2O_002",
  /** [p6-05] Tệp không hợp lệ để in — chỉ PDF (400) */
  O2O_003: "O2O_003",
  /** [p6-05] Không thể thực hiện ở trạng thái đơn hiện tại (409) */
  O2O_004: "O2O_004",
  /** [p6-05] Đơn chưa có báo giá (409) */
  O2O_005: "O2O_005",
  /** [p6-05] Chỉ tải tệp sau khi đã nhận đơn (403) */
  O2O_006: "O2O_006",
  /** [p6-05] Mã PIN không đúng (400, `details.attemptsLeft`) */
  O2O_007: "O2O_007",
  /** [p6-05] Nhập sai PIN quá nhiều lần (423, `details.retryAfterSeconds`) */
  O2O_008: "O2O_008",
  /** [p6-05] Không tìm thấy tài khoản chủ tiệm (400) */
  O2O_009: "O2O_009",
  /** [p6-05] Địa điểm không còn hiển thị (404) */
  O2O_010: "O2O_010",
  /** [p6-05] Tệp vượt số trang cho phép (400) */
  O2O_011: "O2O_011",
  /** [p6-05] Khoảng trang không hợp lệ (400) */
  O2O_012: "O2O_012",
  /** [p6-05] Địa điểm đã có tiệm in / không phải loại tiệm in (409) */
  O2O_013: "O2O_013",

  // ── Real-time Docs (p6-01 be.md §8) ────────────────────────────────────────────
  /** [p6-01] Workspace đã đạt số tài liệu tối đa (409) */
  DOC_001: "DOC_001",
  /** [p6-01] Chuyển tài liệu riêng tư thành công khai cần xác nhận `confirmPublic` (400) */
  DOC_002: "DOC_002",
  /** [p6-01] Người được mời không thuộc workspace (400, details.invalidUserIds) */
  DOC_003: "DOC_003",
  /** [p6-01] Tài liệu đã đủ số người cộng tác tối đa (409) */
  DOC_004: "DOC_004",
  /** [p6-01] Tài liệu đã lưu trữ, chỉ xem được (403) */
  DOC_005: "DOC_005",
  /** [p6-01] Tài liệu vượt dung lượng cho phép (413) */
  DOC_006: "DOC_006",
  /** [p6-01] Đã đạt số bản lưu thủ công tối đa (409) */
  DOC_007: "DOC_007",
  /** [p6-01] Không thể lưu tài liệu đã lưu trữ (409, chỉ internal PUT state) */
  DOC_008: "DOC_008",
  /** [p6-01] Dịch vụ soạn thảo cộng tác chưa sẵn sàng (503) */
  DOC_009: "DOC_009",

  // ── Whiteboard (p6-02 be.md §8) ────────────────────────────────────────────────
  /** [p6-02] Workspace đã đạt số bảng trắng tối đa (409) */
  WB_001: "WB_001",
  /** [p6-02] Ảnh thu nhỏ không hợp lệ — asset không READY / không đúng scope WHITEBOARD / không phải ảnh của người gắn (400) */
  WB_002: "WB_002",
  /** [p6-02] Người được mời không thuộc workspace (400, details.invalidUserIds) */
  WB_003: "WB_003",
  /** [p6-02] Bảng trắng đã đủ số người cộng tác tối đa (409) */
  WB_004: "WB_004",
  /** [p6-02] Bảng trắng đã lưu trữ, chỉ xem được (403) */
  WB_005: "WB_005",
  /** [p6-02] Đã đạt số bản lưu thủ công tối đa (409) */
  WB_006: "WB_006",
  /** [p6-02] Bảng trắng vượt số phần tử hoặc dung lượng cho phép (413, chỉ internal PUT state) */
  WB_007: "WB_007",
  /** [p6-02] Không thể lưu bảng trắng đã lưu trữ (409, chỉ internal PUT state — collab dựa vào 409 để đóng kết nối soạn) */
  WB_008: "WB_008",

  // ── Coins — kinh tế ảo (p7-02 be.md §8; tiền tố COIN_ chưa module nào dùng) ────────────
  /** [p7-02] Không đủ xu (400, details { balance, required }) */
  COIN_001: "COIN_001",
  /** [p7-02] Bạn đã sở hữu vật phẩm này (409) */
  COIN_002: "COIN_002",
  /** [p7-02] Vật phẩm không còn bán (404) */
  COIN_003: "COIN_003",
  /** [p7-02] Phần thưởng nhiệm vụ đã được nhận (409) */
  COIN_004: "COIN_004",
  /** [p7-02] Nhiệm vụ chưa hoàn thành (400, details { progress, target }) */
  COIN_005: "COIN_005",
  /** [p7-02] Số dư sau giao dịch vượt mức tối đa (400, details { max }) */
  COIN_009: "COIN_009",
  /** [p7-02, chợ tài liệu P1] Nội dung này không thể niêm yết hoặc không thể mua (400) */
  COIN_006: "COIN_006",
  /** [p7-02, chợ tài liệu P1] Bạn đã đạt số tin niêm yết tối đa (409) */
  COIN_007: "COIN_007",
  /** [p7-02, chợ tài liệu P1] Chợ tài liệu chưa được mở (403) */
  COIN_008: "COIN_008",

  // ── Wellbeing — burnout radar (p7-03 be.md §8; tiền tố WELL_ chưa module nào dùng) ────────────
  /** [p7-03] Bạn chưa bật theo dõi sức khoẻ học tập (409) */
  WELL_001: "WELL_001",
  /** [p7-03, P1] Chỉ chia sẻ được với nhóm bạn đang tham gia (403) */
  WELL_002: "WELL_002",
  /** [p7-03] Cấu hình luật không hợp lệ — trùng mã luật, cửa sổ nhỏ hơn số ngày của luật… (400, details.issues) */
  WELL_003: "WELL_003",
  /** [p7-03] Ngưỡng mức cao phải lớn hơn ngưỡng mức trung bình (400) */
  WELL_004: "WELL_004",

  // ── Portfolio một chạm (p6-07 be.md §8) ───────────────────────────────────────
  /** [p6-07] Đường dẫn hồ sơ đã có người dùng — cả slug đang dùng lẫn slug cũ còn giữ 30 ngày của người khác (409) */
  PORT_001: "PORT_001",
  /** [p6-07] Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang (3–30 ký tự) (400) */
  PORT_002: "PORT_002",
  /** [p6-07] Đường dẫn chứa từ không được phép — từ dành riêng hoặc từ cấm (400) */
  PORT_003: "PORT_003",
  /** [p6-07] Bạn chưa có đóng góp nào được ghi nhận trong nhóm này (404) */
  PORT_004: "PORT_004",
  /** [p6-07] Đã đạt số dự án tối đa trong hồ sơ (409) */
  PORT_005: "PORT_005",
  /** [p6-07] Dự án này đã có trong hồ sơ (409) */
  PORT_006: "PORT_006",
  /** [p6-07] Làm mới số liệu quá nhiều (429, details.retryAfterSeconds) */
  PORT_007: "PORT_007",
  /** [p6-07] Hồ sơ đã bị gỡ do vi phạm — không thể công khai (403) */
  PORT_008: "PORT_008",
  /** [p6-07] Hồ sơ đang được tạo trang, vui lòng đợi (409) */
  PORT_009: "PORT_009",
  /** [p6-07] Hồ sơ chưa có nội dung để công khai (400, details.emptySections) */
  PORT_010: "PORT_010",
  /** [p6-07] Hồ sơ chưa được công khai (409) */
  PORT_011: "PORT_011",
  /** [p6-07] Hồ sơ không ở trạng thái bị gỡ (409) */
  PORT_012: "PORT_012",

  // ── Recruiter board (p6-08 be.md §8; tiền tố RECR_ vì REC_ đã là của ghi hình họp p2-06) ─────────────────────────
  /** [p6-08] Bạn đã thuộc một doanh nghiệp (409) */
  RECR_001: "RECR_001",
  /** [p6-08] Doanh nghiệp chưa được duyệt hoặc đang tạm ngưng (403) */
  RECR_002: "RECR_002",
  /** [p6-08] Chỉ chủ sở hữu doanh nghiệp được thực hiện thao tác này (403) */
  RECR_003: "RECR_003",
  /** [p6-08] Doanh nghiệp với tên hoặc mã số thuế này đã được đăng ký (409) */
  RECR_004: "RECR_004",
  /** [p6-08] Doanh nghiệp đã dùng hết lượt gửi lời mời trong tháng (429, `details.period/used/quota`) */
  RECR_005: "RECR_005",
  /** [p6-08] Đã có lời mời đang mở với ứng viên này (409) */
  RECR_006: "RECR_006",
  /** [p6-08] Không thể gửi lời mời cho ứng viên này — cùng thông điệp cho mọi lý do (422) */
  RECR_007: "RECR_007",
  /** [p6-08] Chỉ trao đổi được sau khi ứng viên bấm Quan tâm (403) */
  RECR_008: "RECR_008",
  /** [p6-08] Trạng thái hiện tại không cho phép thao tác này (409) */
  RECR_009: "RECR_009",
  /** [p6-08] Đã đạt giới hạn xem hồ sơ ứng viên trong ngày (429) */
  RECR_010: "RECR_010",
  /** [p6-08] Người dùng này đã thuộc doanh nghiệp khác (409) */
  RECR_011: "RECR_011",
  /** [p6-08] Không thể xoá chủ sở hữu cuối cùng của doanh nghiệp (400) */
  RECR_012: "RECR_012",

  // ── Media / LiveKit (p0-08) ───────────────────────────────────────────────────
  /** [p0-08] Máy chủ media chưa được cấu hình (503) */
  MEDIA_001: "MEDIA_001",
  /** [p0-08] Chữ ký webhook media không hợp lệ (401) */
  MEDIA_002: "MEDIA_002",
  /** [p0-08] Không kết nối được máy chủ media (502) */
  MEDIA_003: "MEDIA_003",
  /** [p0-08] Phòng media không tồn tại hoặc đã đóng (409) */
  MEDIA_004: "MEDIA_004",

  // ── Calls (p2-01 / p2-03) ────────────────────────────────────────────────────
  /** [p2-01] Không tìm thấy cuộc trò chuyện/kênh hoặc không có quyền gọi (404) */
  CALL_001: "CALL_001",
  /** [p2-01] Không thể gọi: hội thoại chỉ đọc hoặc đã chặn nhau (403) */
  CALL_002: "CALL_002",
  /** [p2-01] Người nhận đang bận — dùng trong `skipped` của mời thêm (409) */
  CALL_003: "CALL_003",
  /** [p2-01] Bạn đang ở trong một cuộc gọi khác (409) */
  CALL_004: "CALL_004",
  /** [p2-01] Cuộc gọi không tồn tại hoặc đã kết thúc (410) */
  CALL_005: "CALL_005",
  /** [p2-01] Cuộc gọi không còn đổ chuông — đã trả lời ở nơi khác/huỷ (409) */
  CALL_006: "CALL_006",
  /** [p2-01] Nhóm đang họp — hãy vào phòng họp, `details.meetingId` (409) */
  CALL_007: "CALL_007",
  /** [p2-01] Cuộc gọi đã đủ số người tham gia (409) */
  CALL_008: "CALL_008",
  /** [p2-01] Gọi quá nhanh, `details.retryAfterSeconds` (429) */
  CALL_009: "CALL_009",
  /** [p2-01] Không thể mời thêm vào cuộc gọi 1-1 (400) */
  CALL_010: "CALL_010",
  /** [p2-01] Trạng thái cuộc gọi đã thay đổi, thử lại (409) */
  CALL_011: "CALL_011",
  /** [p2-01] Tính năng gọi chưa bật hoặc chưa cấu hình máy chủ media (503) */
  CALL_012: "CALL_012",
  /** [p2-01] Phạm vi cuộc gọi không hợp lệ (400) */
  CALL_013: "CALL_013",
  /** [p2-01] Không phải người tham gia cuộc gọi (403) */
  CALL_014: "CALL_014",
  /** [p2-01] Không có quyền kết thúc/điều khiển cuộc gọi (403) */
  CALL_015: "CALL_015",
  /** [p2-01/p2-03] Đã bị mời ra khỏi phòng (403) */
  CALL_016: "CALL_016",
  /** [p2-03] Đang có người chia sẻ màn hình trong phòng (409) */
  CALL_017: "CALL_017",
  /** [p2-03] Kênh hoặc nhóm đã lưu trữ, không thể vào phòng thoại (409) */
  CALL_018: "CALL_018",
  /** [p2-03] Người nhận quyền chủ phòng không hợp lệ (400) */
  CALL_019: "CALL_019",

  // ── Phòng Pomodoro (p5-02; họ `CALL_` vì dựng trên `Call ROOM` của p2-03) ──
  /** [p5-02] Kênh này không phải phòng Pomodoro (400) */
  CALL_POMO_001: "CALL_POMO_001",
  /** [p5-02] Phòng đang có phiên Pomodoro (409) */
  CALL_POMO_002: "CALL_POMO_002",
  /** [p5-02] Chỉ đổi cấu hình khi phiên chưa bắt đầu (409) */
  CALL_POMO_003: "CALL_POMO_003",
  /** [p5-02] Chỉ người điều khiển phiên được thực hiện (403) */
  CALL_POMO_004: "CALL_POMO_004",
  /** [p5-02] Lệnh không áp dụng được ở giai đoạn hiện tại (409) */
  CALL_POMO_005: "CALL_POMO_005",
  /** [p5-02] Cần vào phòng trước khi đặt mục tiêu (409) */
  CALL_POMO_006: "CALL_POMO_006",

  // ── Meetings (p2-04; MEET_006/007/008/012/013 và MEET_017..020 thuộc p2-05) ──
  /** [p2-04] Không tìm thấy cuộc họp hoặc không có quyền xem (404) */
  MEET_001: "MEET_001",
  /** [p2-04] Chỉ chủ trì hoặc đồng chủ trì được thao tác (403) */
  MEET_002: "MEET_002",
  /** [p2-04] Thời gian kết thúc phải sau thời gian bắt đầu và không quá 24 giờ (400) */
  MEET_003: "MEET_003",
  /** [p2-04] Không thể đặt lịch họp trong quá khứ (400) */
  MEET_004: "MEET_004",
  /** [p2-04] Cuộc họp đã đạt số người tham dự tối đa (409) */
  MEET_005: "MEET_005",
  /** [p2-05] Cuộc họp chưa bắt đầu (409) */
  MEET_006: "MEET_006",
  /** [p2-05] Cuộc họp đã bị khoá (403) */
  MEET_007: "MEET_007",
  /** [p2-05] Đang chờ chủ trì cho vào phòng (409) */
  MEET_008: "MEET_008",
  /** [p2-04] Thao tác không hợp lệ với trạng thái cuộc họp (409) */
  MEET_009: "MEET_009",
  /** [p2-04] Cuộc họp dùng nền tảng bên ngoài (409) */
  MEET_010: "MEET_010",
  /** [p2-04 P1] Quy tắc lặp lại không hợp lệ (400) */
  MEET_011: "MEET_011",
  /** [p2-05] Chưa tới giờ mở phòng họp (409) */
  MEET_012: "MEET_012",
  /** [p2-05] Đã bị mời ra khỏi phiên họp này (403) */
  MEET_013: "MEET_013",
  /** [p2-04] Người được mời phải là thành viên đang hoạt động của workspace (400) */
  MEET_014: "MEET_014",
  /** [p2-04] Liên kết cuộc họp không hợp lệ với nền tảng đã chọn (400) */
  MEET_015: "MEET_015",
  /** [p2-04] Không thể xoá hoặc rút chủ trì — chuyển chủ trì trước (409) */
  MEET_016: "MEET_016",
  /** [p2-05] Chủ trì chưa cho vào phòng họp (403) */
  MEET_017: "MEET_017",
  /** [p2-05] Phòng họp đã đủ số người tham gia (409) */
  MEET_018: "MEET_018",
  /** [p2-05] Không thể thao tác với chủ trì (403) */
  MEET_019: "MEET_019",
  /** [p2-05] Người này hiện không có trong phòng họp (404) */
  MEET_020: "MEET_020",
  /** [p2-06] Chỉ viết biên bản cho cuộc họp đang diễn ra hoặc đã kết thúc (409) */
  MEET_021: "MEET_021",
  /** [p2-06] Biên bản đã đạt số tệp đính kèm tối đa (409) */
  MEET_022: "MEET_022",
  /** [p2-06] Nội dung biên bản trống hoặc quá dài (400) */
  MEET_023: "MEET_023",

  // ── Ghi hình cuộc họp (p2-06) ────────────────────────────────────────────────
  /** [p2-06] Còn người tham gia chưa đồng ý ghi hình (409, `details.pendingCount`/`declinedCount`) */
  REC_001: "REC_001",
  /** [p2-06] Cuộc họp đang được ghi hình (409) */
  REC_002: "REC_002",
  /** [p2-06] Không thể bắt đầu ghi hình lúc này (503) — egress lỗi hoặc hết slot đồng thời */
  REC_003: "REC_003",
  /** [p2-06] Bản ghi chưa sẵn sàng (409) */
  REC_004: "REC_004",
  /** [p2-06] Bản ghi không còn khả dụng — đã xoá hoặc hết hạn lưu trữ (404) */
  REC_005: "REC_005",
  /** [p2-06] Cuộc họp này không cho phép ghi hình (403) */
  REC_006: "REC_006",
  /** [p2-06] Chỉ ghi hình được khi cuộc họp đang diễn ra (409) */
  REC_007: "REC_007",
  /** [p2-06] Yêu cầu đồng ý đã hết hạn (409) */
  REC_008: "REC_008",
  /** [p2-06] Hệ thống lưu trữ hiện tại không hỗ trợ ghi hình (409) */
  REC_009: "REC_009",

  // ── Live quiz (p5-01) ────────────────────────────────────────────────────────
  // Mã theo p5-01 be.md §8 (+ QUIZ_009/010 do be.md §5 create/kick nhắc tới nhưng chưa liệt kê).
  /** Mã PIN không đúng hoặc phiên đã hết hạn (404) */
  QUIZ_001: "QUIZ_001",
  /** Phiên thi đã kết thúc (410) */
  QUIZ_002: "QUIZ_002",
  /** Phòng thi đã đủ người (409) */
  QUIZ_003: "QUIZ_003",
  /** Bạn đã trả lời câu này (409) */
  QUIZ_004: "QUIZ_004",
  /** Câu hỏi đã hết thời gian hoặc chưa mở (409) */
  QUIZ_005: "QUIZ_005",
  /** Bộ câu hỏi không đủ câu trắc nghiệm (400) */
  QUIZ_006: "QUIZ_006",
  /** Thao tác không hợp lệ với trạng thái phiên hiện tại (409) */
  QUIZ_007: "QUIZ_007",
  /** Kết quả đang được tổng hợp, thử lại sau (202 — trả bằng ResponseUtils, không ném) */
  QUIZ_008: "QUIZ_008",
  /** Không tạo được mã PIN, vui lòng thử lại (503) */
  QUIZ_009: "QUIZ_009",
  /** Bạn đã bị mời ra khỏi phòng thi này (403) */
  QUIZ_010: "QUIZ_010",

  // ── Integrations (p5-03) ─────────────────────────────────────────────────────
  // Mã theo p5-03 be.md §8. Nhãn tiếng Việt ở admin: `admin/src/shared/constants/error-codes.ts` (test `error-codes-sync`).
  /** Nhà cung cấp tích hợp chưa được bật hoặc chưa cấu hình (400) */
  INT_001: "INT_001",
  /** Nhóm đã đạt số tích hợp tối đa (409) */
  INT_002: "INT_002",
  /** Phiên kết nối (OAuth state) sai/đã dùng/hết hạn (400) */
  INT_003: "INT_003",
  /** Không lấy được dữ liệu từ nhà cung cấp (502) */
  INT_004: "INT_004",
  /** Kênh/nhóm không thể làm nơi nhận thông báo (403) */
  INT_005: "INT_005",
  /** Sự kiện đã quá thời gian lưu, không phát lại được (410) */
  INT_006: "INT_006",
  /** Chữ ký webhook không hợp lệ (401) */
  INT_007: "INT_007",
  /** Tài khoản bên thứ ba đã được kết nối với nhóm khác (409) */
  INT_008: "INT_008",
  /** Loại sự kiện/thao tác không được hỗ trợ (400) */
  INT_009: "INT_009",
  /** Kết nối đã bị thu hồi, hãy kết nối lại (409) */
  INT_010: "INT_010",

  // ── Vận hành gọi & họp (p2-07) ───────────────────────────────────────────────
  /** [p2-07] Khoảng thời gian thống kê không hợp lệ hoặc vượt quá 92 ngày (400) */
  ADMIN_MEDIA_001: "ADMIN_MEDIA_001",
  /** [p2-07] Cuộc gọi thuộc một cuộc họp — kết thúc qua cuộc họp thay vì cuộc gọi (409, `details.meetingId`) */
  ADMIN_MEDIA_002: "ADMIN_MEDIA_002",

  // ── Mở rộng chat (p7-04 be.md §8): khảo sát POLL_*, tin hẹn giờ SCHED_*, nhắc lại tin REMIND_* ─────────────────
  /** [p7-04] Khảo sát cần 2–10 lựa chọn, không trùng nhau và không quá dài (400) */
  POLL_001: "POLL_001",
  /** [p7-04] Thời hạn khảo sát phải ở tương lai và không quá 30 ngày (400) */
  POLL_002: "POLL_002",
  /** [p7-04] Khảo sát chỉ cho chọn một lựa chọn (400) */
  POLL_003: "POLL_003",
  /** [p7-04] Khảo sát đã kết thúc, không thể bầu thêm (409) */
  POLL_004: "POLL_004",
  /** [p7-04] Không tìm thấy khảo sát hoặc lựa chọn (404) */
  POLL_005: "POLL_005",
  /** [p7-04] Khảo sát ẩn danh không hiển thị danh sách người bầu (403) */
  POLL_006: "POLL_006",
  /** [p7-04] Thời điểm gửi phải sau ít nhất 1 phút và trong vòng 30 ngày (400) */
  SCHED_001: "SCHED_001",
  /** [p7-04] Đã có tối đa 50 tin hẹn giờ đang chờ gửi (409) */
  SCHED_002: "SCHED_002",
  /** [p7-04] Tin hẹn giờ đã được gửi hoặc đã huỷ, không thể thay đổi (409) */
  SCHED_003: "SCHED_003",
  /** [p7-04] Không thể gửi tin: không còn quyền gửi hoặc cuộc trò chuyện đã đóng (403) */
  SCHED_004: "SCHED_004",
  /** [p7-04] Thời điểm nhắc phải sau ít nhất 1 phút và trong vòng 365 ngày (400) */
  REMIND_001: "REMIND_001",
  /** [p7-04] Đã có tối đa 100 lời nhắc đang chờ (409) */
  REMIND_002: "REMIND_002",

  // ── Roadmap — lộ trình học: môn → tháng → buổi (p4-07) ────────────────────────
  /** Đường dẫn (slug) lộ trình đã tồn tại (409) */
  RMAP_001: "RMAP_001",
  /** Nội dung bài học không hợp lệ — kèm `details` vị trí/lý do (400) */
  RMAP_002: "RMAP_002",
  /** Không xoá được tháng còn buổi học (409) */
  RMAP_003: "RMAP_003",
  /** Trạng thái đăng ký lộ trình không phù hợp — đã đăng ký / chưa đăng ký (409) */
  RMAP_004: "RMAP_004",
  /** Lộ trình chưa có buổi nào được xuất bản (409) */
  RMAP_005: "RMAP_005",
  /** Buổi học chưa mở — hoàn thành buổi trước (SEQUENTIAL) (403) */
  RMAP_006: "RMAP_006",
  /** Mục tự kiểm tra không thuộc buổi học (400) */
  RMAP_007: "RMAP_007",
  /** Vượt giới hạn số lượng: tháng/buổi/ảnh/tài liệu (409) */
  RMAP_008: "RMAP_008",

  // ── Plagiarism — quét trùng lặp nội bộ (p7-05 be.md §8) ───────────────────────
  /** [p7-05] Số tệp quét không hợp lệ — tối đa 50 tệp, chế độ so với nhau cần ít nhất 2 tệp (400) */
  PLAG_001: "PLAG_001",
  /** [p7-05] Các tệp đã chọn chưa hỗ trợ kiểm tra trùng lặp (422) */
  PLAG_002: "PLAG_002",
  /** [p7-05] Nhóm đang có quá nhiều lượt quét chạy cùng lúc, vui lòng đợi lượt trước hoàn tất (409) */
  PLAG_003: "PLAG_003",
  /** [p7-05] Nhóm đã dùng hết số lượt quét trong ngày (429) */
  PLAG_004: "PLAG_004",
  /** [p7-05] Lượt quét chưa hoàn tất hoặc đã kết thúc (409) */
  PLAG_005: "PLAG_005",
  /** [p7-05] Báo cáo đã hết thời hạn lưu trữ (410) */
  PLAG_006: "PLAG_006",

  // ── System ───────────────────────────────────────────────────────────────────
  /** Lỗi hệ thống không xác định */
  SYS_500: "SYS_500",
  /** Chức năng chưa được cấu hình / triển khai */
  SYS_501: "SYS_501",
  /** Dịch vụ phụ thuộc không phản hồi (Bad Gateway) */
  SYS_502: "SYS_502",
  /** Dịch vụ tạm thời không khả dụng */
  SYS_503: "SYS_503",
} as const;

/** Union type of all valid error code strings */
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Human-readable Vietnamese labels for each error code.
 */
export const ErrorMessages: Record<ErrorCodeType, string> = {
  AUTH_001: "Email hoặc mật khẩu không đúng",
  AUTH_002: "Token không hợp lệ",
  AUTH_003: "Token đã hết hạn",
  AUTH_004: "Token đã bị thu hồi, vui lòng đăng nhập lại",
  AUTH_005: "Bạn không có quyền thực hiện hành động này",
  AUTH_006: "Refresh token không hợp lệ hoặc đã hết hạn",
  AUTH_008: "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
  AUTH_009: "Refresh token không tìm thấy, vui lòng đăng nhập lại",
  AUTH_010: "Refresh token đã bị dùng lại, mọi phiên đã thu hồi",
  AUTH_011: "Tài khoản đã bị khoá",
  AUTH_012: "Tài khoản đang chờ xoá",
  AUTH_013: "Không xác thực được bằng sinh trắc học. Vui lòng đăng nhập bằng mật khẩu",
  AUTH_014:
    "Đăng nhập sinh trắc học trên thiết bị này đã bị vô hiệu. Vui lòng đăng nhập bằng mật khẩu rồi bật lại",
  AUTH_015:
    "Đăng nhập sinh trắc học đã hết hạn. Vui lòng đăng nhập bằng mật khẩu rồi bật lại",
  AUTH_016: "Đăng nhập sinh trắc học đang tạm tắt",
  AUTH_017: "Thiếu thông tin nền tảng ứng dụng",
  AUTH_018: "Mã nonce không hợp lệ hoặc đã hết hạn, vui lòng lấy mã mới",
  AUTH_019: "Email đã được xác minh",
  AUTH_020: "Mã xác minh không hợp lệ hoặc đã hết hạn",
  AUTH_021: "Cần nhập mật khẩu hiện tại để đổi mật khẩu hoặc email của chính bạn",
  AUTH_022: "Phiên đăng nhập mạng xã hội không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại",
  AUTH_023: "Tài khoản mạng xã hội cần có email đã được xác minh để đăng nhập",
  PERM_001: "Không có quyền trong workspace này",
  PERM_002: "Không có quyền với kênh này",
  PERM_003: "Bạn không có quyền với cuộc trò chuyện này",
  PERM_004: "Bạn không có quyền với cuộc họp này",
  PERM_005: "Bạn không ở trong cuộc gọi này",
  PERM_006: "Vai trò của bạn không đủ để thực hiện thao tác",
  PERM_404: "Không tìm thấy hoặc bạn không có quyền truy cập",
  RT_400: "Dữ liệu sự kiện không hợp lệ",
  RT_401: "Phiên kết nối không hợp lệ, vui lòng kết nối lại",
  RT_404: "Không có kênh sự kiện này",
  RT_409: "Bạn chưa tham gia phòng này",
  RT_413: "Dữ liệu sự kiện quá lớn",
  RT_429: "Thao tác quá nhanh, thử lại sau",
  USER_001: "Không tìm thấy người dùng",
  USER_002: "Email này đã được sử dụng",
  USER_003: "Dữ liệu người dùng không hợp lệ",
  USER_010: "Bạn đang là chủ sở hữu nhóm, hãy chuyển quyền trước khi xoá tài khoản",
  USER_011: "Tài khoản không ở trạng thái chờ xoá hoặc đã hết thời gian huỷ",
  USER_012: "Chỉ quản trị viên cấp cao được ẩn danh ngay lập tức",
  USER_013: "Email xác nhận không khớp",
  USER_014: "Không thể tự xoá tài khoản của chính mình từ trang quản trị",
  VAL_001: "Dữ liệu yêu cầu không hợp lệ",
  RES_001: "Tài nguyên không tồn tại",
  RES_002: "Tài nguyên đã tồn tại",
  RES_003: "Dữ liệu đã thay đổi, vui lòng tải lại rồi thử lại",
  RES_004: "Yêu cầu trùng đang được xử lý",
  RATE_001: "Quá nhiều yêu cầu, vui lòng thử lại sau",
  RATE_002: "Bạn thao tác quá nhanh, vui lòng thử lại sau",
  RATE_003: "Vượt giới hạn tác vụ theo giờ, vui lòng thử lại sau",
  ASSET_001: "Loại tệp không được hỗ trợ",
  ASSET_002: "Tệp vượt kích thước cho phép",
  ASSET_003: "Tệp chưa sẵn sàng để sử dụng",
  ASSET_004: "Bạn không thể thao tác với tệp này ở trạng thái hiện tại",
  ASSET_005: "Tệp không thuộc quyền sử dụng của bạn",
  ASSET_006: "Ghi âm vượt quá thời lượng cho phép",
  ASSET_007: "Chưa nhận được nội dung tệp, hãy tải lên lại",
  ASSET_008: "Không có bản xem trước cho tệp này",
  ASSET_009: "Liên kết tải tệp đã hết hạn",
  ASSET_010: "Tệp đang được sử dụng nên không thể xoá",
  DEVICE_001: "Thông tin thiết bị không hợp lệ",
  DEVICE_002: "Không tìm thấy thiết bị",
  PUSH_001: "Dịch vụ thông báo đẩy chưa được cấu hình",
  PUSH_002: "Người dùng chưa có thiết bị nhận thông báo",
  NOTI_001: "Bộ lọc thông báo không hợp lệ",
  NOTI_002: "Không tìm thấy thông báo",
  NOTI_003: "Mốc thời gian không hợp lệ",
  NOTI_004: "Cài đặt thông báo không hợp lệ",
  OTP_001: "Mã OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu mã mới",
  OTP_002: "Mã OTP không đúng",
  OTP_003: "OTP đã bị khoá do nhập sai quá nhiều lần, vui lòng yêu cầu mã mới",
  OTP_004: "Vui lòng đợi trước khi yêu cầu mã OTP mới",
  OTP_005: "Bạn đã yêu cầu quá nhiều mã OTP, vui lòng thử lại sau 1 giờ",
  CFG_001: "Không tìm thấy khoá cấu hình",
  CFG_002: "Giá trị nằm ngoài giới hạn cho phép",
  CFG_003: "Không thể bật tính năng: phân hệ chưa sẵn sàng hoặc thiếu cấu hình hạ tầng",
  CFG_004: "Tính năng AI đang tạm dừng theo quyết định dự án",
  CFG_005: "Tính năng chưa được bật",
  JOB_001: "Không tìm thấy job trong hàng đợi",
  JOB_002: "Job không ở trạng thái lỗi nên không thể chạy lại",
  JOB_003: "Sự kiện outbox không ở trạng thái thất bại",
  WS_001: "Tên nhóm không hợp lệ",
  WS_002: "Nhóm đã được lưu trữ, không thể thay đổi",
  WS_003: "Người nhận không còn là thành viên đang hoạt động",
  WS_004: "Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm",
  WS_005: "Tên xác nhận không khớp với người nhận",
  WS_006: "Bạn đã tham gia số nhóm tối đa",
  WS_007: "Nhóm đang hoạt động, không cần khôi phục",
  WS_008: "Nhóm phải luôn có đúng một chủ sở hữu",
  WS_009: "Nhóm bị lưu trữ bởi quản trị nền tảng, liên hệ hỗ trợ",
  WS_010: "Không thể thay đổi vai trò chủ nhóm",
  WS_011: "Bạn không đủ quyền thực hiện với thành viên này",
  WS_012: "Không thể tự loại hoặc chặn chính mình",
  WS_013: "Người này không còn là thành viên đang hoạt động",
  WS_014: "Người này không bị chặn",
  WS_015: "Không thể thu hồi chủ nhóm; hãy lưu trữ nhóm nếu cần",
  WS_016: "Tên hiển thị không hợp lệ",
  WS_017: "Yêu cầu tham gia đang chờ quản trị nhóm duyệt",
  WS_018: "Nhóm chưa bật mời khách hoặc đã đủ số khách",
  WS_019: "Bạn vừa bị từ chối, hãy thử lại sau",
  INV_001: "Lời mời đã hết hạn",
  INV_002: "Lời mời đã hết lượt sử dụng",
  INV_003: "Lời mời đã bị thu hồi",
  INV_004: "Bạn không thể tham gia nhóm này",
  INV_005: "Nhóm đã được lưu trữ",
  INV_006: "Nhóm đã có quá nhiều lời mời đang hoạt động",
  INV_007: "Lời mời không hợp lệ",
  INV_008: "Lời mời này dành cho một địa chỉ email khác hoặc email của bạn chưa được xác minh",
  INV_009: "Liên kết mời không thể dùng để mời khách",
  INV_010: "Lời mời đã hết hạn hoặc đã bị thu hồi",
  INV_011: "Người này đã là thành viên của nhóm",
  CH_001: "Tên kênh đã tồn tại trong nhóm",
  CH_002: "Tên kênh không hợp lệ",
  CH_003: "Kênh phải còn ít nhất một người quản lý",
  CH_004: "Kênh đã được lưu trữ, không thể thay đổi",
  CH_005: "Cần chọn kênh công khai đang hoạt động khác làm kênh mặc định",
  CH_006: "Nhóm đã có số kênh tối đa",
  CH_007: "Kênh này không thể khôi phục bằng thao tác thường",
  CH_008: "Thao tác không áp dụng cho loại hiển thị của kênh",
  CH_009: "Không thể rời kênh mặc định",
  CH_010: "Loại kênh này chưa được bật",
  CH_011: "Có người được chọn không còn là thành viên nhóm",
  CH_012: "Không thao tác cấp nền tảng trên kênh riêng tư",
  CH_013: "Bạn chỉ có thể chỉ định kênh riêng tư mà bạn quản lý",
  MSG_001: "Tin nhắn vượt quá 4.000 ký tự",
  MSG_002: "Mỗi tin tối đa 5 tệp đính kèm",
  MSG_003: "Đã quá thời gian cho phép sửa tin nhắn",
  MSG_004: "Bạn không thể gửi tin nhắn ở đây",
  MSG_005: "Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ",
  MSG_006: "Tin nhắn đã bị thu hồi",
  MSG_007: "Tin nhắn trống",
  MSG_008: "Nhắc tên không hợp lệ",
  MSG_009: "Chỉ người gửi mới sửa được tin nhắn này",
  MSG_010: "Đã đạt số tin ghim tối đa, hãy bỏ ghim một tin cũ",
  MSG_011: "Tin nhắn thoại dài quá 5 phút",
  MSG_012: "Không tìm thấy tin nhắn trong cuộc trò chuyện này",
  MSG_013: "Biểu tượng cảm xúc không hợp lệ",
  MSG_014: "Tin nhắn đã có quá nhiều loại cảm xúc",
  MSG_015: "Không thể chuyển tiếp tin nhắn này",
  MSG_016: "Không thể xem trước liên kết này",
  MSG_017: "Chưa hỗ trợ chuyển tiếp tới người dùng trực tiếp (hội thoại chưa khả dụng)",
  MSG_018: "Cuộc trò chuyện này không hỗ trợ luồng trả lời",
  MSG_019: "Không thể tạo luồng trong một luồng",
  MSG_020: "Bạn không được nhắc tất cả thành viên ở đây",
  MSG_021: "Bạn đã nhắc tất cả quá nhiều lần, thử lại sau",
  CONV_001: "Bạn chỉ nhắn tin được với người cùng nhóm",
  CONV_002: "Không thể gửi tin nhắn cho người này",
  CONV_003: "Có người không thuộc nhóm làm việc này",
  CONV_004: "Nhóm chat đã đạt số thành viên tối đa",
  CONV_005: "Chủ nhóm cần chuyển quyền trước khi rời",
  CONV_006: "Bạn không thể thao tác với người có vai trò ngang hoặc cao hơn",
  CONV_007: "Cuộc trò chuyện đã giải tán hoặc lưu trữ",
  CONV_008: "Không thể rời cuộc trò chuyện 1-1",
  CONV_009: "Bạn chỉ ghim được tối đa 20 cuộc trò chuyện",
  CONV_010: "Tên nhóm phải từ 1 đến 80 ký tự",
  CONV_011: "Không thể tạo cuộc trò chuyện với chính bạn",
  CONV_012: "Thành viên nhóm này do cuộc họp quản lý",
  CONV_013: "Chưa có cuộc trò chuyện với người này",
  CONV_014: "Bạn chưa thể nhắn tin trực tiếp cho người này",
  CONV_015: "Nhóm chat này chưa cho phép khách tham gia",
  MOD_001: "Báo cáo này đã được xử lý",
  MOD_002: "Không tìm thấy nội dung để báo cáo",
  MOD_003: "Hành động không áp dụng cho loại báo cáo này",
  MOD_004: "Không có quyền xem nội dung này",
  MOD_005: "Quyền xem nội dung đã hết hạn",
  MOD_006: "Bạn gửi báo cáo quá nhiều, thử lại sau",
  BLOCK_001: "Không thể thực hiện với chính bạn",
  BLOCK_002: "Không thể gửi tin cho người này",
  BLOCK_003: "Không thể thêm người này",
  BLOCK_004: "Bạn đã chặn số người tối đa",
  SRCH_001: "Từ khoá tìm kiếm cần từ 2 đến 100 ký tự",
  SRCH_002: "Từ khoá có quá nhiều từ, hãy rút gọn",
  SRCH_003: "Phạm vi này không hỗ trợ tìm kiếm",
  SRCH_004: "Bạn đã lưu số tin nhắn tối đa, hãy bỏ lưu bớt",
  SRCH_101: "Từ khoá tìm kiếm phải từ 2 đến 100 ký tự",
  SRCH_102: "Không tìm thấy phạm vi tìm kiếm",
  SRCH_103: "Bạn không thể tìm thành viên trong nhóm này",
  SRCH_104: "Tìm kiếm quá rộng, hãy thêm bộ lọc hoặc thu hẹp thời gian",
  TPL_001: "Mẫu nhóm không tồn tại hoặc đã tắt",
  TPL_002: "Không thể áp mẫu cho nhóm đã lưu trữ",
  TPL_003: "Nhóm đã đạt số kênh tối đa",
  ANN_001: "Chỉ kênh thông báo mới yêu cầu xác nhận đã đọc",
  ANN_002: "Kênh đang có quá nhiều thông báo cần xác nhận",
  ANN_003: "Yêu cầu xác nhận đã bị huỷ hoặc hết hạn",
  RSC_001: "Thư mục vượt quá số cấp cho phép",
  RSC_002: "Đã có thư mục cùng tên ở vị trí này",
  RSC_003: "Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu",
  RSC_004: "Thư mục còn nội dung, hãy xoá hoặc di chuyển nội dung trước",
  RSC_005: "Tệp này chưa có bản xem trước",
  RSC_006: "Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó",
  RSC_007: "Kho tài liệu của nhóm đã đầy dung lượng",
  RSC_008: "Không thể khôi phục vì vị trí gốc không còn",
  STUDY_001: "Một số mục học chưa hợp lệ, hãy kiểm tra lại từng mục",
  STUDY_002: "Bộ học đã đạt số mục tối đa",
  STUDY_003: "Bộ học dùng trong nhóm phải chọn nhóm",
  STUDY_004: "Bộ học đã bị ẩn",
  STUDY_005: "Đáp án đúng không nằm trong các lựa chọn",
  STUDY_006: "Ảnh hoặc âm thanh chưa sẵn sàng",
  STUDY_007: "Bạn đã đạt số bộ học tối đa",
  STUDY_008: "Cần xác nhận trước khi công khai bộ học",
  MOCK_001: "Bộ học chưa có câu hỏi chấm điểm được để thi thử",
  MOCK_002: "Bạn đang có bài thi dở của bộ học này",
  MOCK_003: "Đã hết thời gian làm bài",
  MOCK_004: "Bài thi đã được nộp",
  MOCK_005: "Câu trả lời không thuộc đề thi",
  MOCK_006: "Bạn đã thi thử bộ học này quá số lần cho phép hôm nay",
  SR_001: "Thẻ này đang tạm ngừng ôn tập",
  SR_002: "Bộ học chưa có mục nào để ôn tập",
  SR_003: "Bạn đã ôn quá số thẻ cho phép trong ngày",
  GAME_001: "Không tìm thấy luật điểm kinh nghiệm",
  GAME_002: "Điều kiện mở huy hiệu không hợp lệ",
  GAME_003: "Mã huy hiệu đã tồn tại",
  GAME_004: "Mức điều chỉnh điểm kinh nghiệm vượt giới hạn cho phép",
  GAME_005: "Cấu hình cấp độ không hợp lệ",
  GAME_006: "Chỉ trưng bày được huy hiệu bạn đã đạt, tối đa 6 huy hiệu",
  TASK_001: "Cột không tồn tại trên bảng này",
  TASK_002: "Thẻ chưa đủ điều kiện để hoàn thành",
  TASK_003: "Checklist đã đạt số mục tối đa",
  TASK_004: "Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ",
  TASK_007: "Cột còn thẻ, hãy chuyển thẻ trước khi xoá cột",
  TASK_008: "Bảng phải có đúng một cột Hoàn thành và không đổi loại cột đang có thẻ",
  TASK_009: "Nhóm đã đạt số bảng tối đa",
  TASK_010: "Bảng đã đạt số thẻ tối đa",
  TASK_011: "Bảng đã đạt số nhãn tối đa",
  TASK_012: "Thẻ đã đạt số tệp đính kèm tối đa",
  TASK_013: "Ngày bắt đầu phải trước hạn chót",
  TASK_014: "Có người được nhắc tên không thuộc nhóm",
  TASK_015: "Đã quá thời gian cho phép sửa bình luận",
  TASK_016: "Thẻ đã xoá quá lâu, không thể khôi phục",
  TASK_005: "Không thể tạo phụ thuộc vòng giữa các thẻ",
  TASK_006: "Đổi hạn này sẽ dời lịch các thẻ phía sau, vui lòng xác nhận",
  TASK_017: "Phụ thuộc không hợp lệ: hai thẻ phải khác nhau, cùng bảng và chưa bị xoá",
  TASK_018: "Thẻ đã đạt số phụ thuộc tối đa",
  TASK_019: "Lịch các thẻ đã thay đổi, vui lòng xem lại trước khi dời",
  TASK_020: "Bảng đang có một lần dời lịch khác, vui lòng thử lại sau",
  TASK_021: "Chuỗi phụ thuộc quá lớn để xử lý",
  REVIEW_001: "Lượt chấm đã đóng hoặc bạn không còn được giao chấm thẻ này",
  REVIEW_002: "Điểm chấm không khớp tiêu chí đánh giá",
  REVIEW_003: "Bạn đang là người thực hiện thẻ này nên không thể tự chấm",
  REVIEW_004: "Cấu hình chấm chéo không hợp lệ",
  REVIEW_005: "Không có thành viên phù hợp để giao chấm",
  REVIEW_006: "Vui lòng ghi nhận xét khi yêu cầu sửa",
  REVIEW_007: "Thẻ không có lượt chấm đang mở",
  CONTRIB_001: "Bảng đóng góp chỉ để xem, không thể chỉnh sửa",
  CONTRIB_002: "Tổng trọng số phải bằng 100",
  CONTRIB_003: "Kỳ báo cáo không hợp lệ",
  CONTRIB_004: "Khoảng ngày của biểu đồ hoạt động vượt giới hạn cho phép",
  CONTRIB_005: "Tệp báo cáo đã hết hạn, vui lòng xuất lại",
  CONTRIB_006: "Báo cáo đang được tạo, vui lòng chờ",
  SKILL_001: "Mã kỹ năng đã tồn tại",
  SKILL_002: "Tiêu chí kỹ năng không hợp lệ",
  SKILL_003: "Người dùng chưa có huy hiệu kỹ năng này",
  SKILL_004: "Huy hiệu chưa bị thu hồi",
  SKILL_005: "Đã đạt số kỹ năng tối đa",
  SKILL_006: "Vừa chạy đánh giá lại gần đây, vui lòng thử lại sau",
  WALLET_001: "Người tham gia không thuộc nhóm",
  WALLET_002: "Tổng số tiền chia không khớp",
  WALLET_003: "Ảnh chưa sẵn sàng, vui lòng thử lại sau",
  WALLET_004: "Khoản chi đã có người thanh toán, hãy tạo khoản điều chỉnh",
  WALLET_005: "Số tiền vượt quá khoản nợ hiện tại",
  WALLET_006: "Không thể trả tiền cho chính mình",
  WALLET_007: "Giao dịch không còn ở trạng thái chờ xác nhận",
  WALLET_008: "Nơi nhận nhắc nợ không hợp lệ",
  WALLET_009: "Bạn đã có tối đa số tài khoản nhận tiền",
  WALLET_010: "Vừa nhắc nợ gần đây, thử lại sau",
  MENTOR_001: "Nhóm đã có tối đa số bài tìm cố vấn đang mở",
  MENTOR_002: "Bài đăng không còn nhận ứng tuyển",
  MENTOR_003: "Bạn đã ứng tuyển bài này",
  MENTOR_004: "Bạn đã là thành viên hoặc không thể tham gia nhóm này",
  MENTOR_005: "Bài đã đủ cố vấn hoặc vừa thay đổi, tải lại rồi thử lại",
  MENTOR_006: "Bạn có quá nhiều đơn đang chờ",
  MENTOR_007: "Tổng thời gian cố vấn vượt giới hạn",
  MENTOR_008: "Kênh được chọn không hợp lệ",
  MENTOR_009: "Đợt cố vấn đã kết thúc",
  MENTOR_010: "Đơn ứng tuyển không còn ở trạng thái chờ",
  O2O_001: "Tiệm hiện không nhận đơn",
  O2O_002: "Tiệm không hỗ trợ cấu hình in đã chọn",
  O2O_003: "Tệp không hợp lệ để in (chỉ PDF)",
  O2O_004: "Không thể thực hiện ở trạng thái đơn hiện tại",
  O2O_005: "Đơn chưa có báo giá",
  O2O_006: "Chỉ tải tệp sau khi đã nhận đơn",
  O2O_007: "Mã PIN không đúng",
  O2O_008: "Nhập sai quá nhiều lần, thử lại sau",
  O2O_009: "Không tìm thấy tài khoản chủ tiệm",
  O2O_010: "Địa điểm không còn hiển thị",
  O2O_011: "Tệp vượt số trang cho phép",
  O2O_012: "Khoảng trang không hợp lệ",
  O2O_013: "Địa điểm đã có tiệm in hoặc không phải tiệm in",
  DOC_001: "Nhóm đã đạt số tài liệu tối đa",
  DOC_002: "Chuyển tài liệu riêng tư thành công khai cần xác nhận",
  DOC_003: "Người được mời không thuộc nhóm",
  DOC_004: "Tài liệu đã đủ số người cộng tác tối đa",
  DOC_005: "Tài liệu đã lưu trữ, chỉ xem được",
  DOC_006: "Tài liệu vượt dung lượng cho phép",
  DOC_007: "Đã đạt số bản lưu thủ công tối đa",
  DOC_008: "Không thể lưu tài liệu đã lưu trữ",
  DOC_009: "Dịch vụ soạn thảo cộng tác chưa sẵn sàng, vui lòng thử lại sau",
  WB_001: "Nhóm đã đạt số bảng trắng tối đa",
  WB_002: "Ảnh thu nhỏ không hợp lệ",
  WB_003: "Người được mời không thuộc nhóm",
  WB_004: "Bảng trắng đã đủ số người cộng tác tối đa",
  WB_005: "Bảng trắng đã lưu trữ, chỉ xem được",
  WB_006: "Đã đạt số bản lưu thủ công tối đa",
  WB_007: "Bảng trắng vượt số phần tử hoặc dung lượng cho phép",
  WB_008: "Không thể lưu bảng trắng đã lưu trữ",
  COIN_001: "Bạn không đủ xu",
  COIN_002: "Bạn đã sở hữu vật phẩm này",
  COIN_003: "Vật phẩm không còn được bán",
  COIN_004: "Phần thưởng nhiệm vụ đã được nhận",
  COIN_005: "Nhiệm vụ chưa hoàn thành",
  COIN_009: "Số dư xu vượt mức tối đa cho phép",
  COIN_006: "Nội dung này không thể niêm yết hoặc không thể mua",
  COIN_007: "Bạn đã đạt số tin niêm yết tối đa",
  COIN_008: "Chợ tài liệu chưa được mở",
  WELL_001: "Bạn chưa bật theo dõi sức khoẻ học tập",
  WELL_002: "Chỉ chia sẻ được với nhóm bạn đang tham gia",
  WELL_003: "Cấu hình luật không hợp lệ",
  WELL_004: "Ngưỡng mức cao phải lớn hơn mức trung bình",
  PORT_001: "Đường dẫn hồ sơ đã có người dùng",
  PORT_002: "Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang (3–30 ký tự)",
  PORT_003: "Đường dẫn chứa từ không được phép",
  PORT_004: "Bạn chưa có đóng góp nào được ghi nhận trong nhóm này",
  PORT_005: "Đã đạt số dự án tối đa trong hồ sơ",
  PORT_006: "Dự án này đã có trong hồ sơ",
  PORT_007: "Bạn làm mới số liệu quá nhiều, vui lòng thử lại sau",
  PORT_008: "Hồ sơ đã bị gỡ do vi phạm, liên hệ hỗ trợ để được xem xét",
  PORT_009: "Hồ sơ đang được tạo trang, vui lòng đợi",
  PORT_010: "Hồ sơ chưa có nội dung để công khai",
  PORT_011: "Hồ sơ chưa được công khai",
  PORT_012: "Hồ sơ không ở trạng thái bị gỡ",
  RECR_001: "Bạn đã thuộc một doanh nghiệp",
  RECR_002: "Doanh nghiệp chưa được duyệt hoặc đang tạm ngưng",
  RECR_003: "Chỉ chủ sở hữu doanh nghiệp được thực hiện thao tác này",
  RECR_004: "Doanh nghiệp với tên hoặc mã số thuế này đã được đăng ký",
  RECR_005: "Doanh nghiệp đã dùng hết lượt gửi lời mời trong tháng",
  RECR_006: "Đã có lời mời đang mở với ứng viên này",
  RECR_007: "Không thể gửi lời mời cho ứng viên này",
  RECR_008: "Chỉ trao đổi được sau khi ứng viên bấm Quan tâm",
  RECR_009: "Trạng thái hiện tại không cho phép thao tác này",
  RECR_010: "Đã đạt giới hạn xem hồ sơ ứng viên trong ngày",
  RECR_011: "Người dùng này đã thuộc doanh nghiệp khác",
  RECR_012: "Không thể xoá chủ sở hữu cuối cùng của doanh nghiệp",
  MEDIA_001: "Máy chủ media chưa được cấu hình",
  MEDIA_002: "Chữ ký webhook media không hợp lệ",
  MEDIA_003: "Không kết nối được máy chủ media, thử lại sau",
  MEDIA_004: "Phòng media không tồn tại hoặc đã đóng",
  CALL_001: "Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền gọi",
  CALL_002: "Không thể gọi: cuộc trò chuyện đang chỉ đọc hoặc đã chặn nhau",
  CALL_003: "Người nhận đang bận",
  CALL_004: "Bạn đang ở trong một cuộc gọi khác",
  CALL_005: "Cuộc gọi không tồn tại hoặc đã kết thúc",
  CALL_006: "Cuộc gọi không còn đổ chuông (đã được trả lời ở nơi khác hoặc đã huỷ)",
  CALL_007: "Nhóm đang họp — hãy vào phòng họp",
  CALL_008: "Cuộc gọi đã đủ số người tham gia",
  CALL_009: "Bạn thực hiện cuộc gọi quá nhanh, vui lòng thử lại sau",
  CALL_010: "Không thể mời thêm vào cuộc gọi 1-1 — hãy tạo nhóm",
  CALL_011: "Trạng thái cuộc gọi đã thay đổi, vui lòng thử lại",
  CALL_012: "Tính năng gọi chưa được bật hoặc chưa cấu hình máy chủ media",
  CALL_013: "Phạm vi cuộc gọi không hợp lệ",
  CALL_014: "Bạn không phải người tham gia cuộc gọi này",
  CALL_015: "Bạn không có quyền kết thúc hoặc điều khiển cuộc gọi này",
  CALL_016: "Bạn đã bị mời ra khỏi phòng này",
  CALL_017: "Đang có người chia sẻ màn hình trong phòng",
  CALL_018: "Kênh hoặc nhóm đã lưu trữ, không thể vào phòng thoại",
  CALL_019: "Người nhận quyền chủ phòng không hợp lệ (phải đang ở trong phòng)",
  CALL_POMO_001: "Kênh này không phải phòng Pomodoro",
  CALL_POMO_002: "Phòng đang có phiên Pomodoro",
  CALL_POMO_003: "Chỉ đổi cấu hình khi phiên chưa bắt đầu",
  CALL_POMO_004: "Chỉ người điều khiển phiên được thực hiện thao tác này",
  CALL_POMO_005: "Lệnh không áp dụng được ở giai đoạn hiện tại",
  CALL_POMO_006: "Bạn cần vào phòng trước khi đặt mục tiêu",
  MEET_001: "Không tìm thấy cuộc họp hoặc bạn không có quyền xem",
  MEET_002: "Chỉ chủ trì hoặc đồng chủ trì được thực hiện thao tác này",
  MEET_003: "Thời gian kết thúc phải sau thời gian bắt đầu và không dài quá 24 giờ",
  MEET_004: "Không thể đặt lịch họp trong quá khứ",
  MEET_005: "Cuộc họp đã đạt số người tham dự tối đa",
  MEET_006: "Cuộc họp chưa bắt đầu",
  MEET_007: "Cuộc họp đã bị khoá, không thể tham gia thêm",
  MEET_008: "Bạn đang chờ chủ trì cho vào phòng",
  MEET_009: "Thao tác không hợp lệ với trạng thái hiện tại của cuộc họp",
  MEET_010: "Cuộc họp dùng nền tảng bên ngoài, hãy mở liên kết cuộc họp",
  MEET_011: "Quy tắc lặp lại không hợp lệ",
  MEET_012: "Chưa tới giờ mở phòng họp",
  MEET_013: "Bạn đã bị mời ra khỏi phiên họp này",
  MEET_014: "Người được mời phải là thành viên đang hoạt động của workspace",
  MEET_015: "Liên kết cuộc họp không hợp lệ với nền tảng đã chọn",
  MEET_016: "Không thể xoá hoặc rút chủ trì — hãy chuyển quyền chủ trì trước",
  MEET_017: "Chủ trì chưa cho bạn vào phòng họp, hãy thử lại sau",
  MEET_018: "Phòng họp đã đủ số người tham gia",
  MEET_019: "Không thể thực hiện thao tác này với chủ trì",
  MEET_020: "Người này hiện không có trong phòng họp",
  MEET_021: "Chỉ viết biên bản cho cuộc họp đang diễn ra hoặc đã kết thúc",
  MEET_022: "Biên bản đã đạt số tệp đính kèm tối đa",
  MEET_023: "Nội dung biên bản trống hoặc quá dài",
  REC_001: "Còn người tham gia chưa đồng ý ghi hình",
  REC_002: "Cuộc họp đang được ghi hình",
  REC_003: "Không thể bắt đầu ghi hình lúc này, vui lòng thử lại",
  REC_004: "Bản ghi chưa sẵn sàng",
  REC_005: "Bản ghi không còn khả dụng (đã xoá hoặc hết hạn lưu trữ)",
  REC_006: "Cuộc họp này không cho phép ghi hình",
  REC_007: "Chỉ ghi hình được khi cuộc họp đang diễn ra",
  REC_008: "Yêu cầu đồng ý đã hết hạn, hãy gửi lại yêu cầu",
  REC_009: "Hệ thống lưu trữ hiện tại không hỗ trợ ghi hình",
  QUIZ_001: "Mã PIN không đúng hoặc phiên đã hết hạn",
  QUIZ_002: "Phiên thi đã kết thúc",
  QUIZ_003: "Phòng thi đã đủ người",
  QUIZ_004: "Bạn đã trả lời câu này",
  QUIZ_005: "Câu hỏi đã hết thời gian",
  QUIZ_006: "Bộ câu hỏi không đủ câu trắc nghiệm",
  QUIZ_007: "Thao tác không hợp lệ với trạng thái phiên hiện tại",
  QUIZ_008: "Kết quả đang được tổng hợp, thử lại sau",
  QUIZ_009: "Không tạo được mã PIN, vui lòng thử lại",
  QUIZ_010: "Bạn đã bị mời ra khỏi phòng thi này",
  INT_001: "Nhà cung cấp tích hợp chưa được bật",
  INT_002: "Nhóm đã đạt số tích hợp tối đa",
  INT_003: "Phiên kết nối đã hết hạn, vui lòng thử lại",
  INT_004: "Không lấy được dữ liệu từ nhà cung cấp",
  INT_005: "Không thể dùng kênh/nhóm này làm nơi nhận thông báo",
  INT_006: "Sự kiện đã quá thời gian lưu, không phát lại được",
  INT_007: "Chữ ký webhook không hợp lệ",
  INT_008: "Tài khoản bên thứ ba đã được kết nối với nhóm khác",
  INT_009: "Loại sự kiện không được hỗ trợ",
  INT_010: "Kết nối đã bị thu hồi, hãy kết nối lại",
  ADMIN_MEDIA_001: "Khoảng thời gian thống kê không hợp lệ hoặc vượt quá 92 ngày",
  ADMIN_MEDIA_002: "Cuộc gọi này thuộc một cuộc họp, hãy kết thúc cuộc họp thay vì cuộc gọi",
  POLL_001: "Khảo sát cần từ 2 đến 10 lựa chọn, không trùng nhau và không quá dài",
  POLL_002: "Thời hạn khảo sát phải ở tương lai và không quá 30 ngày",
  POLL_003: "Khảo sát này chỉ cho chọn một lựa chọn",
  POLL_004: "Khảo sát đã kết thúc, không thể bầu thêm",
  POLL_005: "Không tìm thấy khảo sát hoặc lựa chọn",
  POLL_006: "Khảo sát ẩn danh không hiển thị danh sách người bầu",
  SCHED_001: "Thời điểm gửi phải sau ít nhất 1 phút và trong vòng 30 ngày",
  SCHED_002: "Bạn đã có tối đa 50 tin hẹn giờ đang chờ gửi",
  SCHED_003: "Tin hẹn giờ đã được gửi hoặc đã huỷ, không thể thay đổi",
  SCHED_004: "Không thể gửi tin: bạn không còn quyền gửi hoặc cuộc trò chuyện đã đóng",
  REMIND_001: "Thời điểm nhắc phải sau ít nhất 1 phút và trong vòng 365 ngày",
  REMIND_002: "Bạn đã có tối đa 100 lời nhắc đang chờ",
  RMAP_001: "Đường dẫn lộ trình đã tồn tại",
  RMAP_002: "Nội dung bài học không hợp lệ",
  RMAP_003: "Không xoá được tháng còn buổi học",
  RMAP_004: "Trạng thái đăng ký lộ trình không phù hợp",
  RMAP_005: "Lộ trình chưa có buổi nào được xuất bản",
  RMAP_006: "Buổi học chưa mở — hãy hoàn thành buổi trước",
  RMAP_007: "Mục tự kiểm tra không thuộc buổi học này",
  RMAP_008: "Đã đạt giới hạn số lượng",
  PLAG_001: "Số tệp quét không hợp lệ (tối đa 50 tệp, chế độ so với nhau cần ít nhất 2 tệp)",
  PLAG_002: "Các tệp đã chọn chưa hỗ trợ kiểm tra trùng lặp",
  PLAG_003: "Nhóm đang có quá nhiều lượt quét chạy cùng lúc, vui lòng đợi lượt trước hoàn tất",
  PLAG_004: "Nhóm đã dùng hết số lượt quét trong ngày",
  PLAG_005: "Lượt quét chưa hoàn tất hoặc đã kết thúc",
  PLAG_006: "Báo cáo đã hết thời hạn lưu trữ",
  SYS_500: "Lỗi hệ thống, vui lòng thử lại",
  SYS_501: "Chức năng chưa được cấu hình",
  SYS_502: "Dịch vụ phụ thuộc không phản hồi",
  SYS_503: "Dịch vụ tạm thời không khả dụng",
};
