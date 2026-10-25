import { ACCESS_ERROR_MESSAGES } from './access-error-codes.constants';
import { DISCOVERY_ERROR_MESSAGES } from './discovery-error-codes.constants';
import { MESSAGE_ERROR_MESSAGES } from './message-error-codes.constants';
import { MODERATION_ERROR_MESSAGES } from './moderation-error-codes.constants';
import { PLAGIARISM_ERROR_MESSAGES } from './plagiarism-error-codes.constants';
import { TASK_ERROR_MESSAGES } from './task-error-codes.constants';
import { WALLET_ERROR_MESSAGES } from './wallet-error-codes.constants';

/**
 * Mã lỗi backend → câu tiếng Việt.
 *
 * Dùng CHUNG bảng mã với base web `base-projects` để hai nền tảng nói cùng một
 * thứ tiếng khi cùng một lỗi xảy ra — người dùng gọi hỗ trợ mà đọc hai câu khác
 * nhau cho cùng một sự cố là chuyện đã gặp.
 *
 * ⛔ Chỉ ánh xạ mã KHÔNG phụ thuộc nghiệp vụ. Mã riêng của từng dự án thì để ở
 * feature tương ứng — nhét hết vào đây thì base gánh từ vựng của mọi dự án.
 */
export const ERROR_CODE_MESSAGES: Record<string, string> = {
  // ── Xác thực ──────────────────────────────────────────────────────────────
  AUTH_001: 'Email hoặc mật khẩu không đúng',
  AUTH_002: 'Token không hợp lệ',
  AUTH_003: 'Phiên đăng nhập đã hết hạn',
  AUTH_004: 'Token đã bị thu hồi',
  AUTH_005: 'Bạn không có quyền truy cập',
  AUTH_006: 'Refresh token không hợp lệ hoặc đã hết hạn',
  AUTH_008: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
  AUTH_009: 'Refresh token không tìm thấy, vui lòng đăng nhập lại',
  AUTH_010: 'Refresh token đã bị dùng lại, mọi phiên đã thu hồi',
  AUTH_011: 'Tài khoản đã bị khoá',
  AUTH_012: 'Tài khoản đang chờ xoá',

  // ── Đăng nhập sinh trắc học / khoá ứng dụng (p0-13) ─────────────────────────
  AUTH_013: 'Không xác thực được bằng sinh trắc học. Vui lòng đăng nhập bằng mật khẩu',
  AUTH_014:
    'Đăng nhập sinh trắc học trên thiết bị này đã bị vô hiệu. Vui lòng đăng nhập bằng mật khẩu rồi bật lại',
  AUTH_015:
    'Đăng nhập sinh trắc học đã hết hạn. Vui lòng đăng nhập bằng mật khẩu rồi bật lại',
  AUTH_016: 'Đăng nhập sinh trắc học đang tạm tắt',
  AUTH_017: 'Thiếu thông tin nền tảng ứng dụng',
  /**
   * MỚI so với `be.md` gốc — nonce bị BE từ chối vì sai/hết hạn/đã dùng
   * (`GET /auth/nonce` cấp cho `login`/`register`/`biometric/login`, mỗi mã
   * dùng đúng một lần). App xử lý bằng cách LẤY MÃ MỚI rồi thử lại, không phải
   * hỏi lại người dùng — nhưng vẫn cần một câu hiển thị nếu lượt thử lại đó
   * cũng thất bại.
   */
  AUTH_018: 'Mã nonce không hợp lệ hoặc đã hết hạn, vui lòng lấy mã mới',

  // ── Quyền theo scope (p0-02) ─────────────────────────────────────────────
  PERM_001: 'Không có quyền trong workspace này',
  PERM_002: 'Không có quyền với kênh này',
  PERM_003: 'Bạn không có quyền với cuộc trò chuyện này',
  PERM_004: 'Bạn không có quyền với cuộc họp này',
  PERM_005: 'Bạn không ở trong cuộc gọi này',
  PERM_006: 'Vai trò của bạn không đủ để thực hiện thao tác',
  PERM_404: 'Không tìm thấy hoặc bạn không có quyền truy cập',

  // ── Người dùng ───────────────────────────────────────────────────────────
  USER_001: 'Không tìm thấy người dùng',
  USER_002: 'Email đã được sử dụng',
  USER_003: 'Mật khẩu cũ không đúng',
  USER_010: 'Bạn đang là chủ sở hữu nhóm, hãy chuyển quyền trước khi xoá tài khoản',
  USER_011: 'Tài khoản không ở trạng thái chờ xoá hoặc đã hết thời gian huỷ',
  USER_012: 'Chỉ quản trị viên cấp cao được ẩn danh ngay lập tức',
  USER_013: 'Email xác nhận không khớp',
  USER_014: 'Không thể tự xoá tài khoản của chính mình từ trang quản trị',

  // ── Dữ liệu / tài nguyên ─────────────────────────────────────────────────
  VAL_001: 'Dữ liệu đầu vào không hợp lệ',
  RES_001: 'Không tìm thấy tài nguyên',
  RES_002: 'Tài nguyên đã tồn tại',
  RES_003: 'Dữ liệu đã thay đổi, vui lòng tải lại rồi thử lại',
  RES_004: 'Yêu cầu trùng đang được xử lý',
  RATE_001: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
  RATE_002: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
  RATE_003: 'Vượt giới hạn tác vụ theo giờ, vui lòng thử lại sau',

  // ── Tệp (asset) ──────────────────────────────────────────────────────────
  ASSET_001: 'Loại tệp không được hỗ trợ',
  ASSET_002: 'Tệp vượt kích thước cho phép',
  ASSET_003: 'Tệp chưa sẵn sàng để sử dụng',
  ASSET_004: 'Tệp không thuộc phạm vi này',
  ASSET_005: 'Nội dung tệp không khớp loại khai báo',
  ASSET_006: 'Ghi âm vượt quá thời lượng cho phép',
  ASSET_007: 'Chưa nhận được nội dung tệp, hãy tải lên lại',
  ASSET_008: 'Không có bản xem trước cho tệp này',
  ASSET_009: 'Liên kết tải tệp đã hết hạn',
  ASSET_010: 'Tệp đang được sử dụng nên không thể xoá',

  // ── Thiết bị / thông báo đẩy (p0-06) ───────────────────────────────────────
  DEVICE_001: 'Thông tin thiết bị không hợp lệ',
  DEVICE_002: 'Không tìm thấy thiết bị',
  PUSH_001: 'Dịch vụ thông báo đẩy chưa được cấu hình',
  PUSH_002: 'Người dùng chưa có thiết bị nhận thông báo',
  NOTI_001: 'Bộ lọc thông báo không hợp lệ',
  NOTI_002: 'Không tìm thấy thông báo',

  // ── OTP ──────────────────────────────────────────────────────────────────
  OTP_001: 'Mã OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu mã mới',
  OTP_002: 'Mã OTP không đúng',
  OTP_003: 'OTP đã bị khoá do nhập sai quá nhiều lần, vui lòng yêu cầu mã mới',
  OTP_004: 'Vui lòng đợi trước khi yêu cầu mã OTP mới',
  OTP_005: 'Bạn đã yêu cầu quá nhiều mã OTP, vui lòng thử lại sau 1 giờ',

  // ── Job / hàng đợi (p0-04) ───────────────────────────────────────────────
  JOB_001: 'Không tìm thấy job trong hàng đợi',
  JOB_002: 'Job không ở trạng thái lỗi nên không thể chạy lại',
  JOB_003: 'Sự kiện outbox không ở trạng thái thất bại',

  // ── Realtime (Socket.IO, p0-03) ──────────────────────────────────────────
  RT_400: 'Dữ liệu sự kiện không hợp lệ',
  RT_401: 'Phiên kết nối không hợp lệ, vui lòng kết nối lại',
  RT_404: 'Không có kênh sự kiện này',
  RT_409: 'Bạn chưa tham gia phòng này',
  RT_413: 'Dữ liệu sự kiện quá lớn',
  RT_429: 'Thao tác quá nhanh, thử lại sau',

  // ── Workspace (p1-01) ────────────────────────────────────────────────────
  WS_001: 'Tên nhóm không hợp lệ',
  WS_002: 'Nhóm đã được lưu trữ, không thể thay đổi',
  WS_003: 'Người nhận không còn là thành viên đang hoạt động',
  WS_004: 'Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm',
  WS_005: 'Tên xác nhận không khớp với người nhận',
  WS_006: 'Bạn đã tham gia số nhóm tối đa',
  WS_007: 'Nhóm đang hoạt động, không cần khôi phục',
  WS_008: 'Nhóm phải luôn có đúng một chủ sở hữu',
  WS_009: 'Nhóm bị lưu trữ bởi quản trị nền tảng, liên hệ hỗ trợ',

  // ── Thành viên / lời mời (p1-02) ─────────────────────────────────────────
  WS_010: 'Không thể thay đổi vai trò chủ nhóm',
  WS_011: 'Bạn không đủ quyền thực hiện với thành viên này',
  WS_012: 'Không thể tự loại hoặc chặn chính mình',
  WS_013: 'Người này không còn là thành viên đang hoạt động',
  WS_014: 'Người này không bị chặn',
  WS_015: 'Không thể thu hồi chủ nhóm; hãy lưu trữ nhóm nếu cần',
  WS_016: 'Tên hiển thị không hợp lệ',
  INV_001: 'Lời mời đã hết hạn',
  INV_002: 'Lời mời đã hết lượt sử dụng',
  INV_003: 'Lời mời đã bị thu hồi',
  INV_004: 'Bạn không thể tham gia nhóm này',
  INV_005: 'Nhóm đã được lưu trữ',
  INV_006: 'Nhóm đã có quá nhiều lời mời đang hoạt động',
  INV_007: 'Lời mời không hợp lệ',

  // ── Kênh (p1-03) ─────────────────────────────────────────────────────────
  CH_001: 'Tên kênh đã tồn tại trong nhóm',
  CH_002: 'Tên kênh không hợp lệ',
  CH_003: 'Kênh phải còn ít nhất một người quản lý',
  CH_004: 'Kênh đã được lưu trữ, không thể thay đổi',
  CH_005: 'Cần chọn kênh công khai đang hoạt động khác làm kênh mặc định',
  CH_006: 'Nhóm đã có số kênh tối đa',
  CH_007: 'Kênh này không thể khôi phục bằng thao tác thường',
  CH_008: 'Thao tác không áp dụng cho loại hiển thị của kênh',
  CH_009: 'Không thể rời kênh mặc định',
  CH_010: 'Loại kênh này chưa được bật',
  CH_011: 'Có người được chọn không còn là thành viên nhóm',
  CH_012: 'Không thao tác cấp nền tảng trên kênh riêng tư',

  // ── Tin nhắn · luồng · nhắc tên (p1-04, p1-06) — `MSG_001..021` ───────────
  // Tách sang `message-error-codes.constants.ts` (file này đã ở trần dòng).
  ...MESSAGE_ERROR_MESSAGES,

  // ── Khách · lời mời email · duyệt tham gia (p3-04) — `INV_008..011`, `WS_017..019`, `CH_013`, `CONV_014/015` ──
  ...ACCESS_ERROR_MESSAGES,

  // ── Bảng công việc · chi tiết thẻ (p3-02, p3-03) — `TASK_001..016` (`task-error-codes.constants.ts`) ──
  ...TASK_ERROR_MESSAGES,

  // ── Ví nhóm & chia tiền (p6-04) — `WALLET_001..010` (`wallet-error-codes.constants.ts`) ──
  ...WALLET_ERROR_MESSAGES,

  // ── Tìm kiếm · tin đã lưu (p1-09) — `SRCH_001..004` (`discovery-error-codes.constants.ts`) ──
  ...DISCOVERY_ERROR_MESSAGES,
  // ── Báo cáo · kiểm duyệt · chặn (p1-08) — `moderation-error-codes.constants.ts` ──
  ...MODERATION_ERROR_MESSAGES,

  // ── Hội thoại 1-1 & nhóm (p1-05) ─────────────────────────────────────────
  CONV_001: 'Bạn chỉ nhắn tin được với người cùng nhóm',
  CONV_002: 'Không thể gửi tin nhắn cho người này',
  CONV_003: 'Có người không thuộc nhóm làm việc này',
  CONV_004: 'Nhóm chat đã đạt số thành viên tối đa',
  CONV_005: 'Chủ nhóm cần chuyển quyền trước khi rời',
  CONV_006: 'Bạn không thể thao tác với người có vai trò ngang hoặc cao hơn',
  CONV_007: 'Cuộc trò chuyện đã giải tán hoặc lưu trữ',
  CONV_008: 'Không thể rời cuộc trò chuyện 1-1',
  CONV_009: 'Bạn chỉ ghim được tối đa 20 cuộc trò chuyện',
  CONV_010: 'Tên nhóm phải từ 1 đến 80 ký tự',
  CONV_011: 'Không thể tạo cuộc trò chuyện với chính bạn',
  CONV_012: 'Thành viên nhóm này do cuộc họp quản lý',
  CONV_013: 'Chưa có cuộc trò chuyện với người này',

  // ── Quét trùng lặp nội bộ (p7-05) — `PLAG_001..006` (`plagiarism-error-codes.constants.ts`) ──
  ...PLAGIARISM_ERROR_MESSAGES,

  // ── Hệ thống ─────────────────────────────────────────────────────────────
  SYS_500: 'Lỗi hệ thống, vui lòng thử lại',
  SYS_501: 'Chức năng chưa được cấu hình',
  SYS_502: 'Dịch vụ tạm thời không khả dụng',
  SYS_503: 'Dịch vụ tạm thời không khả dụng',
};

/**
 * Mã HTTP → câu tiếng Việt.
 *
 * Đây là ĐƯỜNG LUI CUỐI CÙNG, chỉ dùng khi backend không trả câu nào. Câu do
 * backend trả luôn được ưu tiên vì nó biết ngữ cảnh: "Mã hợp đồng đã tồn tại"
 * hữu ích hơn hẳn "Yêu cầu không hợp lệ".
 */
export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ',
  401: 'Bạn cần đăng nhập để tiếp tục',
  403: 'Bạn không có quyền truy cập',
  404: 'Không tìm thấy tài nguyên',
  408: 'Yêu cầu quá thời gian chờ',
  409: 'Dữ liệu đã bị thay đổi bởi người khác',
  413: 'Tệp tải lên quá lớn',
  415: 'Định dạng tệp không được hỗ trợ',
  422: 'Dữ liệu không hợp lệ',
  429: 'Quá nhiều yêu cầu',
  500: 'Lỗi máy chủ nội bộ',
  502: 'Dịch vụ không khả dụng',
  503: 'Hệ thống đang bảo trì',
  504: 'Máy chủ phản hồi quá chậm',
};

/**
 * Câu cho lỗi MẠNG — không có mã HTTP nào cả.
 *
 * Trên di động đây là lỗi hay gặp nhất, hơn hẳn mọi mã 4xx/5xx cộng lại: thang
 * máy, hầm gửi xe, công trường, tàu điện. Câu chữ phải nói rõ là lỗi KẾT NỐI
 * chứ không phải app hỏng, và gợi ý đúng việc người dùng làm được.
 */
export const NETWORK_ERROR_MESSAGE = 'Không có kết nối mạng. Kiểm tra Wi-Fi hoặc dữ liệu di động.';

/** Khi request bị cắt vì quá `apiTimeout`. */
export const TIMEOUT_ERROR_MESSAGE = 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.';

/** Khi không moi được thông tin gì từ lỗi. */
export const UNKNOWN_ERROR_MESSAGE = 'Đã xảy ra lỗi không xác định';
