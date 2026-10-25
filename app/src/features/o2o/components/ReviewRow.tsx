import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { ReviewView } from '../api/o2o.types';
import { NOISE_OPTION_LABEL } from '../constants/o2o.constants';

/**
 * Một đánh giá: người viết, "N/5 sao · độ ồn" bằng CHỮ (không dùng hàng sao vẽ — trình đọc màn hình đọc thẳng câu này), bình luận, thời điểm.
 * Bình luận là CHỮ THUẦN do người dùng nhập — ⛔ không dựng markdown/HTML từ nó. Đánh giá của chính mình gắn nhãn "Của bạn".
 * Ảnh đại diện: BE chỉ trả `author { id, name }` (không có URL ảnh) ⇒ `Avatar` dựng chữ viết tắt từ tên — mỗi đánh giá có một "gương mặt".
 */
export function ReviewRow({ review }: { review: ReviewView }) {
  return (
    <View className="flex-row items-start gap-sm py-sm">
      {/* ⚠️ Ẩn khỏi trình đọc màn hình (hai cờ đi cùng nhau: iOS · Android): `Avatar` có `name` tự đọc tên, mà tên đã có ở dòng chữ bên cạnh. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar name={review.author.name} size="sm" />
      </View>
      <View className="flex-1 gap-2xs">
        <View className="flex-row items-center gap-xs">
          <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {review.author.name}
          </Text>
          {review.mine ? <Badge label="Của bạn" size="sm" variant="brand" /> : null}
        </View>
        <Text className="text-body-md text-fg-2">
          {review.rating}/5 sao · {NOISE_OPTION_LABEL[review.noise] ?? 'Chưa rõ độ ồn'} ·{' '}
          {formatRelative(review.updatedAt)}
        </Text>
        {review.comment ? <Text className="text-body-md text-fg-1">{review.comment}</Text> : null}
      </View>
    </View>
  );
}
