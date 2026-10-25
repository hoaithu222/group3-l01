import { memo, useCallback, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Badge, Button, Callout, ConfirmWithReasonModal, EmptyState, Skeleton } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { useRestoreSkillBadge, useRevokeSkillBadge, useUserSkills } from '../service/skill.queries';
import type { AdminUserSkillRow } from '../types/skill.types';
import { summarizeCriteria } from '../utils/skill-form.utils';
import UserSkillProofDrawer from './UserSkillProofDrawer';

export interface UserSkillsTabProps {
  userId: string;
  userName: string;
}

type Pending = { kind: 'revoke' | 'restore'; row: AdminUserSkillRow } | null;

function statusText(r: AdminUserSkillRow): { text: string; tone: 'success' | 'error' | 'neutral' } {
  if (r.badge?.revokedAt)
    return { text: `Đã thu hồi ${formatDate(r.badge.revokedAt, 'DD/MM/YYYY')}`, tone: 'error' };
  if (r.badge)
    return { text: `Đã đạt ${formatDate(r.badge.unlockedAt, 'DD/MM/YYYY')}`, tone: 'success' };
  return { text: 'Chưa đạt', tone: 'neutral' };
}

/**
 * Tab "Kỹ năng" trong ngăn kéo người dùng (admin.md p6-06 §2.3) — `GET /admin/users/:id/skills`: tiến độ từng kỹ năng (task, điểm, review TB,
 * trạng thái), Thu hồi (lý do ≥ 10 ký tự; người dùng nhận thông báo, không tự cấp lại) / Khôi phục (lý do) khi có `skill:update`, "Xem minh chứng"
 * mở ngăn kéo lồng CHỈ id task rút gọn.
 */
const UserSkillsTab = memo(function UserSkillsTab({ userId, userName }: UserSkillsTabProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('skill', 'update'));
  const { data, isError, refetch } = useUserSkills(userId);
  const [pending, setPending] = useState<Pending>(null);
  const [proofSkillId, setProofSkillId] = useState<string | null>(null);
  const revoke = useRevokeSkillBadge();
  const restore = useRestoreSkillBadge();

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!pending) return;
      const args = { userId, skillId: pending.row.skill.id, reason };
      await (pending.kind === 'revoke' ? revoke.mutateAsync(args) : restore.mutateAsync(args));
      setPending(null);
    },
    [pending, restore, revoke, userId],
  );

  if (!data) {
    if (isError) {
      return (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối và quyền xem kỹ năng rồi thử lại."
          intent="error"
          title="Không tải được kỹ năng của người dùng"
        />
      );
    }
    return <Skeleton className="w-full" height={160} />;
  }
  if (data.length === 0) return <EmptyState size="sm" title="Chưa có kỹ năng nào đang bật" />;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Kỹ năng" className="flex flex-col gap-2">
        {data.map((r) => {
          const st = statusText(r);
          return (
            <li key={r.skill.id} className="flex flex-col gap-1 border-b border-divider-1 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-14-medium text-fg-1">{r.skill.name}</span>
                <Badge color={st.tone} variant="tinted">
                  {st.text}
                </Badge>
                {!r.skill.isActive ? (
                  <span className="text-caption-12 text-fg-4">(kỹ năng đang tắt)</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-body-13 text-fg-3">
                <span className="tabular-nums">{`${formatNumber(r.progress.tasksDone)}/${formatNumber(r.skill.criteria.requiredTasksDone)} task`}</span>
                <span className="tabular-nums">{formatNumber(r.progress.storyPoints, 1)} điểm</span>
                <span className="tabular-nums">
                  review TB{' '}
                  {r.progress.avgPeerScore === null
                    ? '—'
                    : formatNumber(r.progress.avgPeerScore, 1)}
                </span>
                <span>Tiêu chí: {summarizeCriteria(r.skill.criteria)}</span>
              </div>
              {r.badge?.revokedAt ? (
                <span className="text-caption-12 text-fg-3">
                  Lý do: {r.badge.revokedReason} · bởi{' '}
                  {r.badge.revokedBy?.name || r.badge.revokedBy?.id}
                </span>
              ) : null}
              {r.badge ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setProofSkillId(r.skill.id)}>
                    Xem minh chứng
                  </Button>
                  {canUpdate ? (
                    <Button
                      size="sm"
                      variant="stroke"
                      onClick={() =>
                        setPending({ kind: r.badge?.revokedAt ? 'restore' : 'revoke', row: r })
                      }
                    >
                      {r.badge.revokedAt ? 'Khôi phục' : 'Thu hồi'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ConfirmWithReasonModal
        confirmTone={pending?.kind === 'revoke' ? 'danger' : 'primary'}
        impact={
          pending
            ? pending.kind === 'revoke'
              ? `Thu hồi "${pending.row.skill.name}" của ${userName}. Người dùng nhận thông báo; huy hiệu không tự cấp lại dù đủ tiêu chí.`
              : `Khôi phục "${pending.row.skill.name}" cho ${userName}.`
            : null
        }
        open={!!pending}
        title={
          pending?.kind === 'revoke' ? 'Thu hồi huy hiệu kỹ năng' : 'Khôi phục huy hiệu kỹ năng'
        }
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setPending(null)}
      />
      <UserSkillProofDrawer
        skillId={proofSkillId}
        userId={userId}
        onClose={() => setProofSkillId(null)}
      />
    </div>
  );
});

export default UserSkillsTab;
