/**
 * Chuỗi DÙNG CHUNG (p0-12) — tiếng Việt, cấu trúc khoá sẵn sàng đổi sang i18next khi có tiếng Anh.
 *
 * ── Phạm vi ──────────────────────────────────────────────────────────────────
 * Chỉ chứa chuỗi của MÃ MỚI (primitive `shared/ui` mới, hook/tiện ích dùng chung). ⛔ KHÔNG chuyển hàng
 * loạt chuỗi hiện có của các màn/feature sang đây — quyết định p0-12 README §2 "Chuỗi": hạ tầng trước, dùng
 * cho mã mới; chuỗi cũ giữ nguyên tại chỗ cho tới khi có nhu cầu đa ngôn ngữ thật (mặc định KHÔNG có tiếng Anh
 * trước Phase 3).
 *
 * ── Quy ước ──────────────────────────────────────────────────────────────────
 *  · Khoá `khu-vực.tên` camelCase, gom theo NGỮ NGHĨA (không theo màn): `state.error.title`.
 *  · Tham số `{tên}`; số nhiều bằng `{ zero?, one?, other }` chọn theo tham số `count` (tiếng Việt không chia
 *    số ít/nhiều, nhưng cần nhánh `zero` cho câu kiểu "Không có …").
 *  · Chuỗi riêng của một feature → `src/features/<x>/strings.ts` (dùng `createTranslator` của `i18n.ts`),
 *    không dồn vào đây.
 *
 * ⚠️ Câu lỗi theo MÃ backend nằm ở `shared/constants/error-codes.ts` (nguồn riêng, đồng bộ với BE) — đừng
 * chép sang đây.
 */
export const COMMON_STRINGS = {
  action: {
    cancel: 'Huỷ',
    close: 'Đóng',
    confirm: 'Xác nhận',
    delete: 'Xoá',
    open: 'Mở',
    retry: 'Thử lại',
    save: 'Lưu',
    share: 'Chia sẻ',
  },
  offline: {
    banner: 'Bạn đang ngoại tuyến',
  },
  state: {
    loading: 'Đang tải…',
    empty: {
      title: 'Chưa có gì ở đây',
      description: 'Khi có nội dung, nó sẽ xuất hiện tại đây.',
    },
    error: {
      title: 'Không tải được dữ liệu',
      description: 'Có lỗi xảy ra. Vui lòng thử lại sau ít phút.',
    },
    offline: {
      title: 'Bạn đang ngoại tuyến',
      description: 'Kiểm tra kết nối mạng rồi thử lại.',
    },
    forbidden: {
      title: 'Bạn không có quyền xem nội dung này',
      description: 'Nội dung không còn khả dụng hoặc bạn không được phép truy cập.',
    },
  },
  count: {
    // `{text}` là số đã rút gọn ("3", "99+") — nơi gọi quyết định cách rút gọn, chuỗi chỉ ghép nhãn.
    unread: '{text} chưa đọc',
    unreadMuted: '{text} chưa đọc, đã tắt thông báo',
    others: { zero: '', other: '{count} người khác' },
  },
  file: {
    cancelUpload: 'Huỷ tải lên',
    failed: 'Tải lên thất bại',
    open: 'Mở tệp',
    retry: 'Thử tải lại',
    uploading: 'Đang tải lên {progress}%',
  },
  media: {
    empty: 'Không có tệp nào để xem',
    image: 'Ảnh {index}/{total}',
    position: '{index}/{total}',
    video: 'Video {index}/{total}',
  },
  time: {
    today: 'Hôm nay',
    yesterday: 'Hôm qua',
  },
  rateLimit: {
    wait: 'Thử lại sau {seconds}s',
  },
} as const;
