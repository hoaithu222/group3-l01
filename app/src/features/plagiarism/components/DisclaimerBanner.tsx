import { Alert } from '@/shared/ui/alert';
import { LinkButton } from '@/shared/ui/button';

import { PLAGIARISM_DISCLAIMER } from '../constants';

interface DisclaimerBannerProps {
  className?: string;
  onOpenHowScoringWorks?: () => void;
}

/**
 * Câu cố định trên mọi màn (app.md §7): "Kết quả là gợi ý để đối chiếu, không phải kết luận về đạo văn." Không đóng
 * vĩnh viễn được trên màn báo cáo (không có nút "x") — chỉ có thể thu gọn ở danh sách lượt quét (chưa làm, luôn hiện).
 *
 * ✅ `Alert tone="info"` của bộ chung thay khối tự dựng: đúng cặp màu đã đo tương phản, có icon mặc định, và
 * ⛔ KHÔNG dùng tông `warning` — tông đó mang vai `alert` (ngắt lời trình đọc màn hình) mà đây chỉ là lời nhắc cố định.
 * "Cách tính điểm" là `LinkButton` (đã tự nới vùng chạm), không còn `Pressable` + chữ nhỏ `hitSlop={8}` thiếu 44dp.
 */
export function DisclaimerBanner({ className, onOpenHowScoringWorks }: DisclaimerBannerProps) {
  return (
    <Alert
      actions={
        onOpenHowScoringWorks ? (
          <LinkButton
            iconLeft="alert-help"
            label="Cách tính điểm"
            size="sm"
            onPress={onOpenHowScoringWorks}
          />
        ) : undefined
      }
      className={className}
      description={PLAGIARISM_DISCLAIMER}
      tone="info"
    />
  );
}
