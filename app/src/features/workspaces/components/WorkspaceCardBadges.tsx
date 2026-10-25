import { View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';

import type { WorkspaceCardFacts } from '../utils/workspace-card';

export interface WorkspaceCardBadgesProps {
  facts: WorkspaceCardFacts;
  isFavorite: boolean;
}

/**
 * Hàng huy hiệu của `WorkspaceCard`: sao yêu thích · vai trò (chủ nhóm/quản trị) · chờ duyệt · lưu trữ · khách (kèm hạn).
 *
 * Trạng thái luôn là `Badge` có CHỮ — màu chỉ phụ (`mobile-ux.md`); sao là HÌNH (không phải màu) nên đứng một mình được.
 * Cả hàng thuần hiển thị: nghĩa đã nằm trong nhãn trợ năng của thẻ (`workspaceCardFacts().a11yLabel`), các mẩu ở đây không
 * phải là phần tử riêng cho trình đọc màn hình (thẻ là MỘT ô bấm). Không có gì để nói ⇒ không vẽ hàng (khỏi khe trống).
 */
export function WorkspaceCardBadges({ facts, isFavorite }: WorkspaceCardBadgesProps) {
  const hasAny =
    isFavorite ||
    facts.roleText !== null ||
    facts.isPending ||
    facts.isArchived ||
    facts.guestText !== null;
  if (!hasAny) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-2xs">
      {isFavorite ? <Icon color="action-accent" name="star" size={16} variant="bulk" /> : null}
      {facts.roleText ? <Badge label={facts.roleText} size="sm" variant="brand" /> : null}
      {facts.isPending ? (
        <View className="flex-row items-center gap-3xs">
          <Icon color="warning" name="clock" size="xs" />
          <Badge label="Đang chờ duyệt" size="sm" variant="warning" />
        </View>
      ) : null}
      {facts.isArchived ? <Badge label="Đã lưu trữ" size="sm" variant="neutral" /> : null}
      {facts.guestText ? (
        <View className="flex-row items-center gap-3xs">
          {facts.guestUrgent ? <Icon color="warning" name="alert-warning" size="xs" /> : null}
          <Badge
            label={facts.guestText}
            size="sm"
            variant={facts.guestUrgent ? 'warning' : 'info'}
          />
        </View>
      ) : null}
    </View>
  );
}
