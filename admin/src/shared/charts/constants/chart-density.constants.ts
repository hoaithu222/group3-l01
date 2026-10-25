/**
 * Thang cỡ chữ + độ dày nét của chart theo CHIỀU CAO THỰC của vùng vẽ.
 *
 * Vấn đề của bản cũ: mọi cỡ chữ là hằng số px (`fontSize: 10`), nên
 *   - ở màn 1080p slot co xuống ~160px thì 10px vẫn là 10px → đọc được nhưng bé,
 *   - bấm phóng to toàn màn hình (`FullscreenSlotView`, cao ~900px) chart chỉ
 *     giãn khoảng trắng còn CHỮ VÀ NÉT KHÔNG ĐỔI → phóng to không giúp đọc rõ,
 *   - trên TV/4K phòng điều hành thì chữ 10px gần như không đọc nổi từ xa.
 *
 * Cách sửa: chia 4 bậc theo chiều cao vùng vẽ. Widget đo chính mình bằng
 * `useChartMetrics` rồi lấy đúng bậc — cùng một component tự nhỏ gọn trong slot
 * và tự to rõ khi phóng toàn màn hình.
 *
 * Cỡ nhỏ nhất trong bảng là **11px** (bậc `compact`). Đây là sàn cứng: dưới
 * mức đó chữ mảnh tới mức mất nét trên nền tối có gradient.
 */

export type ChartDensity = 'compact' | 'base' | 'large' | 'xlarge';

export interface ChartDensityScale {
  /** Cỡ nhãn trục X/Y. */
  axis: number;
  /** Cỡ chữ chú giải (legend). */
  legend: number;
  /** Cỡ dòng tiêu đề trong tooltip. */
  tooltipTitle: number;
  /** Cỡ dòng dữ liệu trong tooltip. */
  tooltipItem: number;
  /** Cỡ nhãn số trên đỉnh cột. */
  barLabel: number;
  /** Cỡ nhãn % quanh donut. */
  pieLabel: number;
  /** Độ dày đường line. */
  lineWidth: number;
  /** Bán kính chấm trên đường. */
  dotRadius: number;
  /** Bán kính chấm khi hover. */
  activeDotRadius: number;
  /** Độ dày đường lưới + đường trục. */
  gridWidth: number;
  /** Bề rộng trục Y — đủ chỗ cho số 4–5 chữ số ở cỡ chữ tương ứng. */
  yAxisWidth: number;
  /** Độ dày nét dẫn (leader line) của nhãn donut. */
  leaderWidth: number;
}

/**
 * Ngưỡng chiều cao (px) của vùng vẽ để chọn bậc.
 * Đo trên vùng vẽ THỰC (đã trừ header 32px + padding 16px của panel).
 */
export const CHART_DENSITY_BREAKPOINTS = {
  /** < 200px — slot bị co hết cỡ. */
  base: 200,
  /** ≥ 360px — slot cao, hoặc panel chiếm 2 hàng. */
  large: 360,
  /** ≥ 520px — phóng to toàn màn hình / màn TV. */
  xlarge: 520,
} as const;

/**
 * ⚠️ Mọi bề dày NÉT MẢNH ở đây phải là SỐ NGUYÊN.
 *
 * Bản trước để `gridWidth: 1.25 / 1.5`, `leaderWidth: 1.25 / 1.75`,
 * `lineWidth: 2.5 / 3.5`. Nét dày lẻ không trùng lưới pixel thiết bị nên trình
 * duyệt phải khử răng cưa: một đường đáng lẽ sắc 1px bị trải thành vệt xám 2px.
 * Đây là thứ làm cả cụm chart trông "chưa nét" — và nét càng mảnh càng lộ, nên
 * lưới với nét dẫn nhãn donut là chỗ ăn đòn nặng nhất.
 *
 * `dotRadius` được phép lẻ: đó là BÁN KÍNH hình tròn, cạnh vốn đã cong nên
 * không có mép thẳng nào để lệch lưới pixel.
 *
 * Lưới giữ 1px ở MỌI bậc: nó là chrome, phải lùi sau dữ liệu. Bậc lớn làm lưới
 * dày lên chỉ khiến nó tranh chú ý với chính đường dữ liệu.
 */
export const CHART_DENSITY_SCALE: Record<ChartDensity, ChartDensityScale> = {
  compact: {
    axis: 11,
    legend: 11,
    tooltipTitle: 12,
    tooltipItem: 11,
    barLabel: 11,
    pieLabel: 11,
    lineWidth: 2,
    dotRadius: 2.5,
    activeDotRadius: 5,
    gridWidth: 1,
    yAxisWidth: 36,
    leaderWidth: 1,
  },
  base: {
    axis: 12,
    legend: 12,
    tooltipTitle: 13,
    tooltipItem: 12,
    barLabel: 13,
    pieLabel: 12,
    lineWidth: 2,
    dotRadius: 3,
    activeDotRadius: 6,
    gridWidth: 1,
    yAxisWidth: 42,
    leaderWidth: 1,
  },
  large: {
    axis: 14,
    legend: 13,
    tooltipTitle: 14,
    tooltipItem: 13,
    barLabel: 15,
    pieLabel: 14,
    lineWidth: 3,
    dotRadius: 4,
    activeDotRadius: 7,
    gridWidth: 1,
    yAxisWidth: 50,
    leaderWidth: 2,
  },
  xlarge: {
    axis: 16,
    legend: 15,
    tooltipTitle: 16,
    tooltipItem: 15,
    barLabel: 18,
    pieLabel: 16,
    lineWidth: 4,
    dotRadius: 5,
    activeDotRadius: 9,
    gridWidth: 1,
    yAxisWidth: 58,
    leaderWidth: 2,
  },
};

/** Bậc mặc định khi chưa đo được kích thước (frame đầu tiên). */
export const CHART_DENSITY_FALLBACK: ChartDensity = 'base';

/*
 * ⛔ KHÔNG có sàn cỡ chữ riêng cho TV, và KHÔNG có ngoại lệ độ dày lưới.
 *
 * Bản đầu có `TV_MIN_FONT = 18` và `TV_GRID_WIDTH = 2`. Cả hai được tính cho
 * phương án cũ (phóng to toàn bộ giao diện 1.8×, khung chart cũng to theo).
 * Phương án đó đã bỏ vì làm vỡ bố cục — nay TV chỉ nhân cỡ chữ ×1.1 còn KHUNG
 * CHART GIỮ NGUYÊN. Ép sàn 18px vào một khung không giãn thì nhãn trục sẽ đè
 * lên nhau và tràn khỏi vùng vẽ; lưới 2px thì tranh chú ý với chính đường dữ
 * liệu. Cứ để `uiScale` nhân đều là đủ.
 */
