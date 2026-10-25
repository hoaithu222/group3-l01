import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

export interface AttachmentProgressProps {
  className?: string;
  /** Nhãn phụ hiển thị cho trình đọc màn hình — mặc định suy từ `progress` (app.md §7 "Đang tải lên 45%"). */
  label?: string;
  /** 0..100. */
  progress: number;
}

/**
 * Thanh tiến độ ngang cho MỘT tệp đang tải.
 *
 * ⚠️ KHÔNG dùng `Progress` của `shared/ui/progress` — component đó là DÒNG
 * THỜI GIAN dọc nhiều bước (hồ sơ vay: "Đăng ký → Thẩm định → Giải ngân"), khác
 * hẳn "một tệp, một con số phần trăm" ở đây. Dùng nhầm là phải nhồi một mảng
 * bước giả cho một thanh %, và tên loại `ProgressStatus` cũng không khớp nghĩa
 * (`'done'|'current'|'pending'` của hồ sơ ≠ trạng thái upload).
 */
export function AttachmentProgress({ className, label, progress }: AttachmentProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const text = label ?? `Đang tải lên ${clamped}%`;

  return (
    <View
      accessibilityLabel={text}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-bg-3', className)}
    >
      {/* Bề rộng theo % là BỐ CỤC tính từ dữ liệu runtime, không phải màu/cỡ chữ
          thô (điều cấm số 3 của AGENTS.md) — không có token nào thay được một
          con số phần trăm động. */}
      <View className="h-full rounded-full bg-action-base" style={{ width: `${clamped}%` }} />
    </View>
  );
}
