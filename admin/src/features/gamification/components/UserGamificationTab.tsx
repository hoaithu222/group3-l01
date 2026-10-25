import { memo, useCallback, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  Badge,
  Button,
  Callout,
  ConfirmWithReasonModal,
  EmptyState,
  Skeleton,
  Text,
} from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { BADGE_RARITY_LABELS } from '../constants/gamification.labels';
import { useRevokeUserBadge, useUserGamification } from '../service/gamification.queries';
import type { UserBadgeHolding } from '../types/gamification.types';
import BadgeIcon from './BadgeIcon';
import UserXpHistory from './UserXpHistory';
import XpAdjustModal from './XpAdjustModal';

export interface UserGamificationTabProps {
  userId: string;
  userName: string;
}

/**
 * Tab "Gamification" trong ngăn kéo người dùng — `GET /admin/users/:id/gamification`: tóm tắt
 * (cấp, XP, chuỗi), huy hiệu (kể cả đã thu hồi; "Thu hồi" → `DELETE /admin/users/:id/badges/:badgeId`), lịch sử XP phân trang cursor; nút "Điều chỉnh XP"
 * chỉ hiện khi có `gamification:update`.
 */
const UserGamificationTab = memo(function UserGamificationTab({
  userId,
  userName,
}: UserGamificationTabProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  // Chồng cursor: phần tử cuối = trang đang xem; rỗng = trang đầu.
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const { data, isError, refetch } = useUserGamification(userId, cursor);
  const adjustModal = useDisclosure();
  const [revoking, setRevoking] = useState<UserBadgeHolding | null>(null);
  const revoke = useRevokeUserBadge();

  const handleRevoke = useCallback(
    async (reason: string) => {
      if (!revoking) return;
      await revoke.mutateAsync({ userId, badgeId: revoking.id, reason });
      setRevoking(null);
    },
    [revoke, revoking, userId],
  );

  if (!data) {
    // Lỗi tải (vd 403 thiếu `gamification:view`, 5xx): báo + "Thử lại" — bản cũ chung nhánh với "đang tải" nên kẹt ở "Đang tải…" mãi.
    if (isError) {
      return (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối và quyền xem gamification rồi thử lại."
          intent="error"
          title="Không tải được thông tin gamification"
        />
      );
    }
    return <Skeleton className="w-full" height={160} />;
  }

  const { summary, badges, xpEvents, xpEventsMeta } = data;
  const heldCount = badges.filter((b) => b.revokedAt === null).length;
  const stats = [
    { label: 'Cấp độ', value: formatNumber(summary.level) },
    { label: 'Tổng XP', value: formatNumber(summary.xp) },
    {
      label: 'Tới cấp sau',
      value: `${formatNumber(summary.xpIntoLevel)}/${formatNumber(summary.xpIntoLevel + summary.xpToNext)}`,
    },
    { label: 'Chuỗi ngày', value: formatNumber(summary.streak) },
    { label: 'Chuỗi dài nhất', value: formatNumber(summary.longestStreak) },
    { label: 'Huy hiệu', value: formatNumber(heldCount) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid flex-1 grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <dt className="text-body-13 text-fg-3">{s.label}</dt>
              <dd className="tabular-nums text-body-14-semibold text-fg-1">{s.value}</dd>
            </div>
          ))}
        </dl>
        {canUpdate && (
          <Button size="sm" variant="stroke" onClick={adjustModal.open}>
            Điều chỉnh XP
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <Text weight="bold">Huy hiệu</Text>
        {badges.length === 0 ? (
          <EmptyState size="sm" title="Chưa có huy hiệu nào" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {badges.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-body-14">
                <BadgeIcon emoji={b.emoji} iconAssetId={b.iconAssetId} name={b.name} />
                <span className="text-body-14-medium text-fg-1">{b.name}</span>
                <Badge color="neutral" variant="tinted">
                  {BADGE_RARITY_LABELS[b.rarity]}
                </Badge>
                {b.unlockedAt && (
                  <span className="text-fg-3">Đạt {formatDate(b.unlockedAt, 'DD/MM/YYYY')}</span>
                )}
                {b.revokedAt && (
                  <Badge color="error" variant="tinted">
                    Đã thu hồi {formatDate(b.revokedAt, 'DD/MM/YYYY')}
                  </Badge>
                )}
                {canUpdate && !b.revokedAt && (
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(b)}>
                    Thu hồi
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <UserXpHistory
        events={xpEvents}
        hasNext={xpEventsMeta.hasMore && !!xpEventsMeta.nextCursor}
        hasPrev={cursors.length > 0}
        onNext={() => {
          const next = xpEventsMeta.nextCursor;
          if (next) setCursors((c) => [...c, next]);
        }}
        onPrev={() => setCursors((c) => c.slice(0, -1))}
      />

      <ConfirmWithReasonModal
        confirmTone="danger"
        impact={
          revoking
            ? `Thu hồi "${revoking.name}" của ${userName}. Huy hiệu đã thu hồi không tự mở lại khi đủ điều kiện.`
            : null
        }
        open={!!revoking}
        title="Thu hồi huy hiệu"
        onConfirm={handleRevoke}
        onOpenChange={(open) => !open && setRevoking(null)}
      />
      <XpAdjustModal
        open={adjustModal.isOpen}
        userId={userId}
        userName={userName}
        onOpenChange={(next) => !next && adjustModal.close()}
      />
    </div>
  );
});

export default UserGamificationTab;
