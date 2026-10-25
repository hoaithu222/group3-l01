import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

/**
 * `meta.partial: true` — server hết ngân sách thời gian (be.md p1-09 §5.4 / p5-04 §5), mới trả được các kết quả MỚI HƠN
 * đã có. Không phải lỗi: kết quả bên dưới vẫn dùng được, chỉ là có thể thiếu tin cũ → gợi ý thu hẹp khoảng ngày.
 */
export function PartialResultNotice({ className }: { className?: string }) {
  return (
    <View className={className}>
      <Alert
        description="Kết quả có thể chưa đầy đủ — thử thu hẹp khoảng ngày hoặc thêm từ khoá."
        tone="warning"
      />
    </View>
  );
}
