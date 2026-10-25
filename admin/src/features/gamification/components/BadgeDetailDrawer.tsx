import { memo } from 'react';

import { Badge, Button, Drawer, EmptyState, Skeleton, Text } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { BADGE_RARITY_LABELS } from '../constants/gamification.labels';
import { useAdminBadge } from '../service/gamification.queries';
import type { AdminBadge } from '../types/gamification.types';
import { summarizeCriteria } from '../utils/badge-form.utils';
import BadgeIcon from './BadgeIcon';

export interface BadgeDetailDrawerProps {
  /** `null` = đóng (đồng bộ với URL: `?badgeId=` hoặc `/gamification/badges/:badgeId`). */
  badgeId: string | null;
  /** Có `gamification:update` — hiện Sửa / Tắt·Bật / Cấp bù. */
  canUpdate: boolean;
  onClose: () => void;
  onEdit: (badge: AdminBadge) => void;
  onToggle: (badge: AdminBadge) => void;
  onBackfill: (badge: AdminBadge) => void;
}

/**
 * Ngăn kéo chi tiết huy hiệu theo URL (admin.md p4-03 §1 route `/gamification/badges/:badgeId`): biểu tượng, điều kiện dạng chữ, số người đã đạt,
 * hành động (dùng lại các hộp thoại của `BadgesTab`) và nhật ký (`AuditTrailPanel` target Badge). Đọc `GET /admin/badges/:id` nên mở thẳng
 * được huy hiệu ở bất kỳ trang nào của danh sách; id không tồn tại → khung "không tìm thấy" (không toast).
 */
const BadgeDetailDrawer = memo(function BadgeDetailDrawer({
  badgeId,
  canUpdate,
  onClose,
  onEdit,
  onToggle,
  onBackfill,
}: BadgeDetailDrawerProps) {
  const { data: badge, isPending, isError } = useAdminBadge(badgeId ?? undefined);

  return (
    <Drawer
      open={badgeId !== null}
      side="right"
      size="lg"
      title={badge?.name ?? 'Huy hiệu'}
      onOpenChange={(next) => !next && onClose()}
    >
      {isPending && badgeId !== null ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !badge ? (
        <EmptyState description="Huy hiệu không tồn tại hoặc bạn không còn quyền xem." title="Không tìm thấy huy hiệu" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <BadgeIcon emoji={badge.emoji} iconAssetId={badge.iconAssetId} name={badge.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-body-16-semibold text-fg-1">{badge.name}</div>
              <div className="text-caption-12 text-fg-4">{badge.code}</div>
              {badge.description ? (
                <Text className="mt-1" size="small" skin="muted">
                  {badge.description}
                </Text>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge color={badge.isActive ? 'success' : 'neutral'} variant="tinted">
                {badge.isActive ? 'Đang bật' : 'Đã tắt'}
              </Badge>
              <Badge color="neutral" variant="tinted">
                {BADGE_RARITY_LABELS[badge.rarity]}
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Fact label="Điều kiện" value={summarizeCriteria(badge.criteria)} wide />
            <Fact label="Số người đã đạt" value={formatNumber(badge.unlockedCount)} />
            <Fact label="Thứ tự" value={String(badge.order)} />
            <Fact label="Tạo lúc" value={formatDate(badge.createdAt, 'HH:mm DD/MM/YYYY')} />
            <Fact label="Cập nhật" value={formatDate(badge.updatedAt, 'HH:mm DD/MM/YYYY')} />
          </dl>

          {canUpdate ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="stroke" onClick={() => onEdit(badge)}>
                Sửa
              </Button>
              <Button size="sm" variant="stroke" onClick={() => onToggle(badge)}>
                {badge.isActive ? 'Tắt' : 'Bật'}
              </Button>
              {badge.isActive ? (
                <Button size="sm" variant="ghost" onClick={() => onBackfill(badge)}>
                  Cấp bù
                </Button>
              ) : null}
            </div>
          ) : null}

          <section className="flex flex-col gap-2">
            <Text weight="bold">Nhật ký</Text>
            <AuditTrailPanel targetId={badge.id} targetType="Badge" />
          </section>
        </div>
      )}
    </Drawer>
  );
});

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 flex flex-col gap-0.5' : 'flex flex-col gap-0.5'}>
      <dt className="text-body-13 text-fg-3">{label}</dt>
      <dd className="text-body-14 text-fg-1">{value}</dd>
    </div>
  );
}

export default BadgeDetailDrawer;
