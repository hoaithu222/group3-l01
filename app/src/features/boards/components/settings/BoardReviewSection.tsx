import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

import { reviewSettingsHref } from '../../utils/review-routes';

/**
 * Lối vào cài đặt chấm chéo của bảng (p4-05 app.md §1: `BoardSettingsScreen` thêm hàng "Chấm chéo" → `review-settings`). Màn Cài đặt bảng
 * chỉ OWNER/ADMIN mở được nên hàng này luôn là lối vào SỬA; MEMBER xem bản chỉ đọc qua "Cách chấm điểm" ở khối Chấm chéo của thẻ.
 */
export function BoardReviewSection({ boardId, wsId }: { boardId: string; wsId: string }) {
  return (
    <Section icon="view" title="Chấm chéo">
      <Card padded={false}>
        <ListItem
          description="Bật/tắt, số lượt duyệt cần và tiêu chí đánh giá"
          label="Cài đặt chấm chéo"
          leading={<Icon color="fg-brand" name="checkmark-square" />}
          trailing={<Icon color="fg-3" name="arrow-right-small" size="sm" />}
          onPress={() => router.push(reviewSettingsHref(wsId, boardId))}
        />
      </Card>
    </Section>
  );
}
