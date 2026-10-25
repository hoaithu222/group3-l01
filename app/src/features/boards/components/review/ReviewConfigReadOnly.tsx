import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import type { ReviewConfigDto } from '../../api/reviews.types';
import { formatCriterionScore, rubricMaxTotal } from '../../utils/review-score';

/**
 * Bản CHỈ ĐỌC của cấu hình chấm chéo (p4-05 app.md §3: "MEMBER → màn chỉ đọc"): trạng thái Bật/Tắt, số lượt duyệt cần và các tiêu chí sẽ
 * dùng để chấm — để người làm biết thẻ của mình sẽ bị chấm thế nào. Chỉ chủ nhóm/quản trị viên sửa được (nói rõ ở đầu trang, không chỉ ẩn nút).
 * Cũng là màn hiện khi bảng đã lưu trữ.
 */
export function ReviewConfigReadOnly({ archived, config }: { archived: boolean; config: ReviewConfigDto }) {
  return (
    <View className="gap-xl py-xs">
      <Alert
        description={archived ? 'Bảng đã lưu trữ — chỉ xem, không sửa được cấu hình.' : 'Chỉ chủ nhóm và quản trị viên mới sửa được cấu hình chấm chéo. Bạn xem được cách thẻ sẽ được chấm.'}
        tone="info"
      />

      <Section icon="view" title="Chấm chéo">
        <Card padded={false}>
          <ListItem divider label="Trạng thái" value={<Badge label={config.enabled ? 'Đang bật' : 'Đang tắt'} variant={config.enabled ? 'success' : 'neutral'} />} />
          <ListItem
            divider
            label="Số lượt duyệt cần"
            value={config.enabled ? String(config.requiredReviews) : '—'}
            valueDescription={`Nhóm có ${config.eligibleReviewerCount} người chấm được`}
          />
        </Card>
      </Section>

      <Section icon="star" title="Tiêu chí đánh giá">
        {config.rubric.length === 0 ? (
          <Text className="text-body-md text-fg-2">Không dùng tiêu chí — người chấm cho điểm chung từ 0 đến 10.</Text>
        ) : (
          <Card padded={false}>
            {config.rubric.map((criterion, index) => (
              <ListItem
                key={criterion.id}
                description={criterion.description ?? undefined}
                divider={index < config.rubric.length - 1}
                label={criterion.label}
                value={`tối đa ${formatCriterionScore(criterion.maxScore)}`}
              />
            ))}
            <ListItem label="Tổng điểm tối đa" value={String(rubricMaxTotal(config.rubric))} />
          </Card>
        )}
      </Section>
    </View>
  );
}
