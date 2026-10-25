/**
 * Bảng màu chart DÙNG CHUNG cho cả 8 box của màn "Tổng quan dự án".
 *
 * Trước đây mỗi module tự khai một bộ token riêng nên cùng một màu mang nhiều
 * nghĩa khác nhau trên cùng một màn hình: `primary-5` vừa là "Thực tế" (Lũy kế),
 * vừa là lát máy #1 (Máy thiết bị), vừa là "Thông báo" (Cảnh báo), vừa là tone
 * KH đến tháng hiện tại (Sản lượng). Người xem không thể học được ý nghĩa màu.
 *
 * File này là NGUỒN DUY NHẤT. Module chỉ được tham chiếu vào đây, KHÔNG khai
 * token màu mới trong `constants/{module}.constants.ts`.
 *
 * Quy ước tuân theo:
 *   - `chart-conventions.md §1.2` — series chỉ dùng scale `-5`
 *   - `chart-conventions.md §1.3` — mảng lớn tô gradient `-6 → -5` (chống bloom)
 *   - `contractor-color-system.md §5` — bảng cứng KH / TT / trạng thái
 */

/**
 * Dải màu series phân loại — 8 slot, thứ tự ĐÃ CỐ ĐỊNH.
 *
 * Thứ tự là cơ chế an toàn màu, KHÔNG được xáo: hue xen kẽ lạnh–ấm–lạnh nên 2
 * lát cạnh nhau luôn cách xa nhau về sắc, kể cả khi mô phỏng mù màu đỏ–lục.
 * Lọc bớt series thì các series còn lại GIỮ NGUYÊN màu, không tô lại theo thứ
 * hạng mới.
 *
 * Trần 8 series — quá 8 thì gom phần dư vào `CHART_OTHER_TOKEN`.
 */
export const CHART_SERIES_TOKENS = [
  'secondary-5', // #22B5D8 cyan
  'warning-5', // #FC820A cam
  'indigo-5', // #818CF8 chàm
  'success-5', // #00E676 lục sáng
  'pink-5', // #F472B6 hồng
  'accent-5', // #FFB700 hổ phách
  'teal-5', // #2DD4BF ngọc
  'purple-5', // #A855F7 tím
] as const;

/** Lát gộp "Khác" — xám trung tính, cố ý KHÔNG tranh chú ý với series thật. */
export const CHART_OTHER_TOKEN = 'neutral-6';

/**
 * Vai trò ngữ nghĩa — BẢNG CỨNG theo `contractor-color-system.md §5.1`.
 * Mọi biểu đồ có cặp Kế hoạch / Thực tế BẮT BUỘC dùng đúng 2 token này để
 * người xem đọc được ý nghĩa mà không cần nhìn chú giải.
 */
export const CHART_SEMANTIC = {
  /** Kế hoạch / baseline — xanh dương, nét đứt. */
  plan: 'info-5',
  /** Thực tế — lục sáng, nét liền và dày hơn. */
  actual: 'success-5',
  /** Dự báo — cam, nét đứt ngắn. */
  forecast: 'warning-5',
} as const;

/** Trạng thái tiến độ — `contractor-color-system.md §5.2`. */
export const CHART_STATUS = {
  /** Hoàn thành. */
  done: 'success-5',
  /** Đang thực hiện. */
  running: 'info-5',
  /** Chậm so với kế hoạch. */
  slow: 'warning-5',
  /** Quá hạn. */
  late: 'error-5',
} as const;

/**
 * Ngưỡng % → bậc trạng thái cho các vòng tiến độ (`ProgressRing`).
 *
 * Có bảng này vì trước đó màu vòng được GÁN TAY từng dòng trong mock: 46% hổ
 * phách · 68% cyan · 75% lục · 92% lục · 23% đỏ. Hai vấn đề:
 *   1. `secondary-5` (68%) và `accent-5` (46%) không nằm trong `CHART_STATUS`,
 *      mà `secondary-5` lại đang là tone gauge "Tiến độ dự án" ở box bên cạnh —
 *      cùng màu, khác nghĩa, trên cùng một màn hình.
 *   2. Thang không đơn điệu (68% cyan "mát" hơn 75% lục) nên người xem không
 *      suy ra được quy luật, màu thành trang trí.
 *
 * Màu là quyết định TRÌNH BÀY, không được nằm trong hợp đồng dữ liệu — nếu để
 * BE trả `colorToken` thì mỗi nguồn dữ liệu sẽ tự bịa một bảng màu khác nhau.
 */
export const PROGRESS_TONE_THRESHOLDS = [
  { min: 90, token: CHART_STATUS.done },
  { min: 60, token: CHART_STATUS.running },
  { min: 30, token: CHART_STATUS.slow },
  { min: 0, token: CHART_STATUS.late },
] as const;

/** Mức độ cảnh báo. */
export const CHART_ALERT = {
  /** Thông báo thường. */
  notice: 'info-5',
  /** Nhắc việc đến hạn hôm nay. */
  dueToday: 'error-5',
  /** Nhắc việc các mốc khác. */
  dueOther: 'warning-5',
} as const;

/**
 * Chrome của chart — trục, lưới, track. KHÔNG phải series data nên được phép
 * dùng scale ngoài `-5` (ngoại lệ đã ghi trong `chart-conventions.md §1.2`).
 *
 * ⚠️ KHÔNG dùng `divider-white-10` (alpha 8%) cho lưới/trục như bản cũ: 8% là
 * gần như vô hình trên cả 2 theme nên người đọc mất mốc để ước lượng giá trị.
 * `border-1` (#DDE6EF sáng / #345677 tối) là mức nhìn thấy được mà vẫn lùi sau
 * dữ liệu.
 */
export const CHART_CHROME = {
  /** Đường lưới ngang/dọc. */
  grid: 'border-1',
  /** Đường trục. */
  axis: 'border-1',
  /** Vành nền của gauge / progress ring — phần CHƯA đạt. */
  track: 'divider-2',
  /** Nhãn trục. */
  axisLabel: 'fg-4',
} as const;

/**
 * Chrome ở CHẾ ĐỘ TV — nâng tương phản, KHÔNG nâng độ bão hoà.
 *
 * Ở khoảng cách ~3 m, `fg-4` (foreground yếu nhất) và `border-1` (#345677 trên
 * nền `bg-base` #04162A) chìm hẳn — người xem mất mốc đọc giá trị. Nâng nhãn
 * trục lên `fg-2` và lưới lên `border-2`.
 *
 * ⛔ CỐ Ý không đụng tới màu SERIES. `chart-conventions.md §1.3` đã đo bằng
 * OKLCH: token `-5` có L > 0.75 nên tô mảng lớn trên nền navy gây bloom/halation
 * (nhoè cạnh, chói khi nhìn lâu). Trên panel 65" hiện tượng này NẶNG HƠN, không
 * nhẹ đi — nên tăng bão hoà ở TV là đi ngược hướng. Chỉ tăng tương phản của
 * chrome (chữ, lưới), giữ nguyên gradient `-6 → -5` cho mảng lớn.
 */
export const CHART_CHROME_TV = {
  grid: 'border-2',
  axis: 'border-2',
  track: 'divider-1',
  axisLabel: 'fg-2',
} as const;

/** Kiểu nét cho đường Kế hoạch / Dự báo — `chart-conventions.md §3.7`. */
export const CHART_DASH = {
  plan: '6 4',
  forecast: '4 4',
} as const;
