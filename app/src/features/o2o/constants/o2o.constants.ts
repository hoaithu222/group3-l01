import type { BadgeVariant } from '@/shared/ui/badge';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  LocationType,
  OrderGroup,
  PaperSize,
  PrintOrderStatus,
  PrintSettings,
} from '../api/o2o.types';

/** Giới hạn khớp `LIMITS.o2o` của BE (`be/src/core/constants/limits.ts`) — BE vẫn là nơi chặn thật, app chỉ chặn sớm cho khỏi một vòng mạng. */
export const O2O_LIMITS = {
  copiesMax: 50,
  orderPagesMax: 500,
  fileMaxBytes: 25 * 1024 * 1024,
  reviewCommentMax: 500,
  pageRangeMaxLength: 100,
  pageRangeMaxSegments: 20,
  radiusDefaultM: 2000,
  radiusMaxM: 10_000,
  nearLimit: 50,
} as const;

/** Bậc bán kính của "Mở rộng bán kính" (m) — bậc cuối = `radiusMaxM` của BE. */
export const RADIUS_STEPS_M = [2000, 5000, 10_000] as const;

/**
 * Tâm mặc định khi người dùng KHÔNG cấp quyền vị trí (khuôn viên — Hà Nội), khớp `LIMITS.o2o.defaultCenter` của BE.
 * ⚠️ SystemConfig `o2o.defaultCenter` là nguồn chỉnh được ở server nhưng app chưa có đường đọc — đổi ở BE thì đổi cả hằng này.
 */
export const DEFAULT_CENTER = { lat: 21.0285, lng: 105.8542 } as const;

/** Bản đồ: làm tròn 3 chữ số thập phân (~110 m) cho khoá cache, trễ khi kéo, và ngưỡng "tâm lệch" để tải lại (app.md §4). */
export const MAP_TUNING = {
  coordDecimals: 3,
  idleDebounceMs: 500,
  recenterRatio: 0.3,
  nearStaleMs: 60_000,
  zoomLevel: 14,
} as const;

/** Đang chờ đếm trang: hỏi lại mỗi 3 giây phòng khi socket rớt (socket vẫn là đường chính). */
export const COUNT_PAGES_POLL_MS = 3000;

export const DEFAULT_SETTINGS: PrintSettings = {
  paper: 'A4',
  color: false,
  copies: 1,
  duplex: false,
  pageRange: null,
  binding: false,
};

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  CAFE: 'Quán cà phê',
  PRINT_SHOP: 'Tiệm in',
  LIBRARY: 'Thư viện',
};

/**
 * Không có icon "cà phê"/"máy in" trong bộ icon Figma — chọn icon gần nghĩa nhất, LUÔN kèm chữ loại ở danh sách
 * (phân biệt bằng icon VÀ chữ, không chỉ màu — app.md §7).
 */
export const LOCATION_TYPE_ICON: Record<LocationType, IconName> = {
  CAFE: 'store',
  PRINT_SHOP: 'document-2',
  LIBRARY: 'book',
};

/**
 * Tông ô icon theo loại — ba loại cạnh nhau trong danh sách trông KHÁC nhau khi nhìn lướt (trước đây cùng `brand`). Tiệm in lấy `success`
 * = tông phân hệ "Địa điểm & in ấn" ở Trang chủ (`module-registry`); màu chỉ bổ trợ, CHỮ loại luôn đi cùng (app.md §7).
 */
export const LOCATION_TYPE_TONE: Record<LocationType, IconTileTone> = {
  CAFE: 'warning',
  PRINT_SHOP: 'success',
  LIBRARY: 'info',
};

/** Tông nhận diện của phân hệ (khớp ô `store-location` ở Trang chủ) — cho dải/hình minh hoạ rỗng của riêng phân hệ này. */
export const O2O_TONE: IconTileTone = 'success';

export const AMENITY_LABEL: Record<string, string> = {
  wifi_fast: 'Wi-Fi nhanh',
  power_outlets: 'Ổ cắm điện',
  quiet_zone: 'Khu yên tĩnh',
  ac: 'Máy lạnh',
  open_late: 'Mở khuya',
  group_tables: 'Bàn nhóm',
  printer: 'Có máy in',
  parking: 'Chỗ gửi xe',
};

export const NOISE_OPTION_LABEL: Record<number, string> = {
  1: 'Rất yên tĩnh',
  2: 'Yên tĩnh',
  3: 'Vừa phải',
  4: 'Hơi ồn',
  5: 'Ồn',
};

export const PAPER_LABEL: Record<PaperSize, string> = { A4: 'A4', A3: 'A3' };

export const WEEKDAY_LABEL = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

/** Chữ TO của trạng thái đơn (vé đơn) — người dùng đọc được từ xa, không cần hiểu mã trạng thái. */
export const STATUS_LABEL: Record<PrintOrderStatus, string> = {
  DRAFT: 'Đơn nháp',
  QUOTED: 'Chưa gửi tiệm',
  PENDING: 'Chờ tiệm nhận',
  ACCEPTED: 'Tiệm đã nhận đơn',
  PRINTING: 'Đang in',
  READY: 'Sẵn sàng nhận',
  PICKED_UP: 'Đã nhận tài liệu',
  REJECTED: 'Tiệm từ chối',
  CANCELLED: 'Đã huỷ',
  EXPIRED: 'Đã hết hạn',
};

/** Câu giải thích dưới trạng thái — nói VIỆC NGƯỜI DÙNG NÊN LÀM tiếp theo. */
export const STATUS_HINT: Record<PrintOrderStatus, string> = {
  DRAFT: 'Chọn xong cấu hình rồi gửi đơn cho tiệm.',
  QUOTED: 'Kiểm tra báo giá rồi gửi đơn cho tiệm.',
  PENDING: 'Tiệm sẽ xem đơn và nhận in. Bạn có thể huỷ đơn lúc này.',
  ACCEPTED: 'Tiệm đã nhận đơn và sắp in. Bạn vẫn huỷ được đơn.',
  PRINTING: 'Tiệm đang in tài liệu của bạn.',
  READY: 'Mang mã PIN tới tiệm để nhận tài liệu và thanh toán tại quầy.',
  PICKED_UP: 'Đơn đã hoàn tất. Cảm ơn bạn đã dùng dịch vụ.',
  REJECTED: 'Tiệm không nhận được đơn này. Bạn có thể đặt in ở tiệm khác.',
  CANCELLED: 'Đơn đã được huỷ, tiệm sẽ không in.',
  EXPIRED: 'Đơn đã quá hạn nên bị đóng. Bạn có thể đặt lại.',
};

export const STATUS_TONE: Record<PrintOrderStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  QUOTED: 'neutral',
  PENDING: 'warning',
  ACCEPTED: 'info',
  PRINTING: 'info',
  READY: 'success',
  PICKED_UP: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};

/**
 * Ô icon của trạng thái đơn (hàng "Đơn của tôi", đầu vé đơn) — cùng tông với huy hiệu `STATUS_TONE` (`error` của huy hiệu ↔ `danger` của ô).
 * ⚠️ Chỉ BỔ TRỢ: chữ trạng thái vẫn nằm trên huy hiệu/tiêu đề ngay bên cạnh (không để icon hay màu làm dấu hiệu duy nhất).
 */
export const STATUS_VISUAL: Record<PrintOrderStatus, { icon: IconName; tone: IconTileTone }> = {
  DRAFT: { icon: 'edit', tone: 'neutral' },
  QUOTED: { icon: 'bill', tone: 'neutral' },
  PENDING: { icon: 'timer', tone: 'warning' },
  ACCEPTED: { icon: 'checkmark-circle', tone: 'info' },
  PRINTING: { icon: 'document-2', tone: 'info' },
  READY: { icon: 'store-location', tone: 'success' },
  PICKED_UP: { icon: 'tick-double-01', tone: 'success' },
  REJECTED: { icon: 'cancel', tone: 'danger' },
  CANCELLED: { icon: 'cancel-2', tone: 'neutral' },
  EXPIRED: { icon: 'clock', tone: 'neutral' },
};

/** Các bước trên dòng thời gian của một đơn ĐI ĐÚNG ĐƯỜNG (theo thứ tự máy trạng thái). */
export const PROGRESS_STEPS: PrintOrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PRINTING',
  'READY',
  'PICKED_UP',
];

/** Trạng thái còn PIN dùng được (khớp `canPerform('REGENERATE_PIN')` của BE) — hết các trạng thái này thì xoá PIN khỏi máy. */
export const PIN_LIVE_STATUSES: PrintOrderStatus[] = ['PENDING', 'ACCEPTED', 'PRINTING', 'READY'];

export const GROUP_TABS: { key: OrderGroup; label: string }[] = [
  { key: 'ACTIVE', label: 'Đang xử lý' },
  { key: 'DONE', label: 'Hoàn tất' },
  { key: 'CLOSED', label: 'Đã huỷ' },
];

/** Hẹn giờ lấy (tuỳ chọn) — preset thay cho bộ chọn ngày giờ đầy đủ: sinh viên thường chỉ cần "sau 1–3 giờ" hay "ngày mai". */
export const PICKUP_PRESETS = [
  { key: 'none', label: 'Không hẹn', minutes: null },
  { key: '1h', label: 'Sau 1 giờ', minutes: 60 },
  { key: '3h', label: 'Sau 3 giờ', minutes: 180 },
  { key: 'tomorrow', label: 'Ngày mai', minutes: 24 * 60 },
] as const;
export type PickupPresetKey = (typeof PICKUP_PRESETS)[number]['key'];

/**
 * Mã lỗi BE (`O2O_001..013`, `be/src/core/utils/error.codes.ts`) → câu tiếng Việt kèm VIỆC NÊN LÀM. Khác câu BE (chỉ nêu sự việc).
 * ⚠️ Cố ý đặt ở feature (cùng cách `mentor`) thay vì `shared/constants/error-codes.ts` — file đó đã ở trần dòng. Interceptor
 * chung vẫn tự toast câu BE cho các lượt KHÔNG tắt toast; lượt tắt toast đi qua `o2oErrorMessage`.
 */
export const O2O_ERROR_MESSAGES: Record<string, string> = {
  O2O_001: 'Tiệm đang tạm ngưng nhận đơn. Hãy chọn tiệm khác hoặc thử lại sau.',
  O2O_002: 'Tiệm không hỗ trợ cấu hình in này. Hãy đổi khổ giấy, in màu hoặc in hai mặt.',
  O2O_003: 'Tệp không in được. Chỉ nhận PDF: hãy xuất tài liệu sang PDF rồi tải lại.',
  O2O_004:
    'Đơn vừa chuyển sang bước khác nên không làm được thao tác này. Hãy làm mới rồi xem lại.',
  O2O_005: 'Đơn chưa có báo giá. Đợi đếm trang xong rồi thử lại.',
  O2O_006: 'Tiệm chỉ tải được tệp sau khi đã nhận đơn.',
  O2O_007: 'Mã PIN không đúng.',
  O2O_008: 'Nhập sai PIN quá nhiều lần. Hãy thử lại sau ít phút.',
  O2O_009: 'Không tìm thấy tài khoản chủ tiệm.',
  O2O_010: 'Địa điểm này không còn hiển thị.',
  O2O_011: 'Tệp quá 500 trang. Hãy tách thành nhiều tệp rồi in từng phần.',
  O2O_012: 'Khoảng trang không hợp lệ. Ví dụ đúng: 1-3,5 (mọi trang không vượt tổng số trang).',
  O2O_013: 'Địa điểm này đã có tiệm in hoặc không phải tiệm in.',
  RES_003: 'Đơn vừa được cập nhật ở nơi khác. Hãy làm mới rồi thử lại.',
  CFG_005: 'Tính năng In ấn chưa được bật.',
};

/** Nhãn dòng thời gian — khớp nhãn sự kiện BE ghi (`status` của mỗi `events[]`, gồm hai nhãn cho hành động KHÔNG đổi trạng thái). */
export const EVENT_LABEL: Record<string, string> = {
  PENDING: 'Đã gửi đơn cho tiệm',
  ACCEPTED: 'Tiệm đã nhận đơn',
  PRINTING: 'Tiệm bắt đầu in',
  READY: 'In xong — sẵn sàng nhận',
  PICKED_UP: 'Đã nhận tài liệu',
  REJECTED: 'Tiệm từ chối đơn',
  CANCELLED: 'Đơn đã huỷ',
  EXPIRED: 'Đơn đã hết hạn',
  PIN_REGENERATED: 'Đã tạo mã PIN mới',
  PAID: 'Tiệm xác nhận đã thanh toán',
};
