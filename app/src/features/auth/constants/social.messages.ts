import type { GoogleSignInFailure } from '@/core/auth/social';

/** Câu chữ của đăng nhập mạng xã hội (Google). */

export const GOOGLE_LOGIN_LABEL = 'Tiếp tục với Google';
export const LOGIN_SOCIAL_DIVIDER_LABEL = 'HOẶC';

/**
 * Câu lỗi theo lý do thất bại phía máy (trước khi gọi BE). Lỗi từ BE (`AUTH_022`/`AUTH_023`/503) do
 * `toAuthErrorMessage(error, 'socialLogin')` dịch. Người dùng tự huỷ hộp chọn tài khoản KHÔNG phải lỗi — không có câu nào ở đây.
 */
export const GOOGLE_SIGN_IN_ERRORS: Readonly<Record<GoogleSignInFailure, string>> = {
  failed: 'Không đăng nhập được bằng Google. Vui lòng thử lại hoặc đăng nhập bằng email.',
  // Lỗi CẤU HÌNH, không phải lỗi của người dùng — thử lại không giúp. Người dùng vẫn có lối thoát (email); người quản trị cần
  // đăng ký SHA-1 của keystore ký bản build + bật provider Google trong Firebase rồi build lại.
  misconfigured:
    'Đăng nhập bằng Google chưa được thiết lập cho bản cài đặt này. Hãy đăng nhập bằng email, hoặc nhờ quản trị viên kiểm tra cấu hình Firebase (SHA-1, nhà cung cấp Google).',
  network: 'Không có kết nối mạng. Kiểm tra mạng rồi thử lại.',
  'not-configured': 'Đăng nhập bằng Google chưa được bật trên bản cài đặt này.',
  'play-services':
    'Thiết bị chưa có Google Play Services hoặc bản đã cũ. Hãy cập nhật rồi thử lại, hoặc đăng nhập bằng email.',
  // Bản cài đặt cũ (build trước khi có module Google) — cách sửa là cài bản mới.
  unavailable: 'Bản cài đặt này chưa hỗ trợ đăng nhập bằng Google. Hãy cập nhật ứng dụng.',
};
