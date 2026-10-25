import { View } from 'react-native';

export interface ProgressBarProps {
  /** Nhãn trợ năng, vd "Đang tải lên 45%". */
  label: string;
  /** 0..100 — ngoài khoảng bị kẹt. */
  percent: number;
}

/**
 * Thanh tiến độ ngang. Bộ chung chỉ có `Progress` (dòng thời gian dọc theo bước)
 * — chưa có thanh phần trăm — nên dựng cục bộ, dùng chung cho hàng đợi tải lên,
 * thanh nổi `UploadQueueBar`, banner dung lượng và tiến độ tải PDF/video.
 * `width` theo phần trăm phải đặt bằng `style` (giá trị động, class không sinh được).
 */
export function ProgressBar({ label, percent }: ProgressBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: value }}
      className="h-1 overflow-hidden rounded-full bg-bg-3"
    >
      <View className="h-1 rounded-full bg-action-base" style={{ width: `${value}%` }} />
    </View>
  );
}
