import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import { joinHref } from '../utils/live-quiz-routes';

export type UnavailableKind = 'cancelled' | 'error' | 'kicked';

const LOOK: Record<UnavailableKind, { icon: IconName; tone: IconTileTone }> = {
  cancelled: { icon: 'flash-off', tone: 'warning' },
  error: { icon: 'alert-warning', tone: 'danger' },
  kicked: { icon: 'logout', tone: 'warning' },
};

interface SessionUnavailableProps {
  /** Câu chữ đã chọn sẵn ở nơi gọi theo lý do. */
  description: string;
  kind: UnavailableKind;
  title: string;
}

/**
 * Màn "phiên không còn khả dụng": bị mời ra, chủ phòng huỷ, hoặc không tải được. Có hình minh hoạ theo tông — bị mời ra/huỷ là
 * tông cam của chế độ (không phải lỗi của người chơi), lỗi tải mới là đỏ; lối thoát duy nhất là "Nhập mã khác".
 */
export function SessionUnavailable({ description, kind, title }: SessionUnavailableProps) {
  const look = LOOK[kind];
  return (
    <EmptyState
      actions={[{ label: 'Nhập mã khác', onPress: () => router.replace(joinHref()) }]}
      description={description}
      icon={look.icon}
      title={title}
      tone={look.tone}
    />
  );
}
