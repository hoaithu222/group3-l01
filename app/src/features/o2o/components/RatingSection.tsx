import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { Section } from '@/shared/ui/section';

import type { LocationDetail } from '../api/o2o.types';
import { noiseLabel, ratingSummary } from '../utils/o2o-format';
import { ReviewRow } from './ReviewRow';

export interface RatingSectionProps {
  detail: LocationDetail;
  onWrite: () => void;
  onSeeAll: () => void;
}

/**
 * Đánh giá của địa điểm (app.md §3): sao trung bình + độ ồn bằng chữ, "Viết/Sửa đánh giá", 5 đánh giá mới nhất, "Xem tất cả" khi còn nhiều hơn.
 * Đánh giá CỦA TÔI luôn hiện trên cùng dù không nằm trong 5 mới nhất (BE trả riêng `myReview`) — sửa/xoá đi từ nút "Sửa đánh giá".
 */
export function RatingSection({ detail, onWrite, onSeeAll }: RatingSectionProps) {
  const { myReview, recentReviews } = detail;
  const others = recentReviews.filter((review) => review.id !== myReview?.id);
  const shown = myReview ? [myReview, ...others] : others;
  const noise = noiseLabel(detail.noiseAvg);

  return (
    <Section icon="star" title="Đánh giá">
      <Card>
        <View className="gap-xs">
          <Text className="text-label-lg font-semibold text-fg-1">{ratingSummary(detail)}</Text>
          {noise ? <Text className="text-body-md text-fg-2">Độ ồn trung bình: {noise}</Text> : null}
          <Button
            fullWidth
            iconLeft="edit"
            label={myReview ? 'Sửa đánh giá của bạn' : 'Viết đánh giá'}
            size="sm"
            variant="secondary"
            onPress={onWrite}
          />
        </View>
        {shown.length === 0 ? (
          <Text className="pt-sm text-body-md text-fg-2">Chưa có đánh giá</Text>
        ) : (
          <View className="pt-xs">
            {shown.map((review, index) => (
              <View key={review.id}>
                {index > 0 ? <Divider /> : null}
                <ReviewRow review={review} />
              </View>
            ))}
          </View>
        )}
        {detail.ratingCount > shown.length ? (
          <Button
            fullWidth
            label={`Xem tất cả ${detail.ratingCount} đánh giá`}
            size="sm"
            variant="tertiary"
            onPress={onSeeAll}
          />
        ) : null}
      </Card>
    </Section>
  );
}
