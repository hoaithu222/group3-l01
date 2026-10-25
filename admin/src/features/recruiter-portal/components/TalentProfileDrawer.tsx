import { useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { OFFER_STATUS_META } from '@/features/recruiter';
import { useEventCallback } from '@/shared/hooks';
import { Avatar, Button, Callout, Drawer, Skeleton, Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';
import { showToast } from '@/shared/utils/toast.utils';

import { PORTAL_ERROR } from '../constants/portal.constants';
import { portalKeys } from '../service/portal.keys';
import { useTalentProfile } from '../service/talent.queries';
import { errorCodeOf, errorStatusOf, retryAfterSecondsOf } from '../utils/portal-errors';
import TalentBadgeList from './TalentBadgeList';
import TalentProofDrawer from './TalentProofDrawer';

export interface TalentProfileDrawerProps {
  companyId: string | undefined;
  /** `null` = đóng. */
  userId: string | null;
  /** `recruiter:create` (thành viên công ty ĐÃ DUYỆT) — thiếu thì ẩn "Gửi lời mời". */
  canOffer: boolean;
  onClose: () => void;
  onSendOffer: (student: { userId: string; displayName: string }) => void;
  /** Đường dẫn mở lời mời đang mở trong tab Lời mời. */
  offerHref: (offerId: string) => string;
  /** `RECR_010` — báo trang hiện banner đếm ngược (`null` = BE không báo thời gian). */
  onViewLimit: (seconds: number | null) => void;
}

/**
 * Ngăn kéo hồ sơ ứng viên (admin.md p6-08 §2.4): thẻ + huy hiệu (kèm "Xem minh chứng") + liên kết portfolio + lời mời đang mở + nút "Gửi lời mời" (ẩn khi đã có lời mời mở hoặc thiếu
 * quyền). Ghi chú "Lượt xem hồ sơ được ghi nhận" luôn hiện — minh bạch với HR, BE ghi nhật ký MỖI lượt và tính trần 300 lượt/ngày.
 *
 * Lỗi phân biệt, KHÔNG gộp: 404 (ứng viên vừa tắt Open to work/chặn công ty) → toast "Ứng viên không còn hiển thị" + đóng ngăn kéo + làm mới danh sách; `RECR_010` → đóng và báo trang
 * hiện banner đếm ngược; lỗi tạm thời → Callout + "Thử lại". Không có email/SĐT ở bất cứ đâu (BE không trả, `toTalentProfile` cũng không nhận).
 */
const TalentProfileDrawer = memo(function TalentProfileDrawer({
  companyId,
  userId,
  canOffer,
  onClose,
  onSendOffer,
  offerHref,
  onViewLimit,
}: TalentProfileDrawerProps) {
  const qc = useQueryClient();
  const [proofSkillId, setProofSkillId] = useState<string | null>(null);
  const { data: profile, isLoading, isError, error, refetch } = useTalentProfile(
    companyId,
    userId,
    userId !== null,
  );

  // `useEventCallback`: identity ổn định + luôn gọi bản MỚI NHẤT của `onClose`/`onViewLimit` (đổi theo render của trang) — effect chỉ chạy khi CÓ LỖI MỚI, không lặp toast.
  const handleLoadError = useEventCallback((err: unknown) => {
    if (errorStatusOf(err) === 404) {
      showToast('info', 'Ứng viên không còn hiển thị');
      if (companyId) void qc.invalidateQueries({ queryKey: portalKeys.talents(companyId) });
      onClose();
    } else if (errorCodeOf(err) === PORTAL_ERROR.viewLimit) {
      onViewLimit(retryAfterSecondsOf(err));
      onClose();
    }
  });
  useEffect(() => {
    if (error) handleLoadError(error);
  }, [error, handleLoadError]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setProofSkillId(null);
      onClose();
    }
  };

  let body: ReactNode;
  let footer: ReactNode = null;
  if (profile) {
    const { card, badges, openOffer } = profile;
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={card.displayName} size="lg" src={card.avatarUrl ?? undefined} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-body-16-medium text-fg-1">{card.displayName}</span>
            {card.headline ? <span className="break-words text-body-14 text-fg-2">{card.headline}</span> : null}
            <span className="text-caption-12 text-fg-4">
              {[card.preferredRoles.join(', '), card.location].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Text size="small" skin="muted">
            {formatNumber(card.badgeCount)} huy hiệu
          </Text>
          {card.contributionPct !== undefined ? (
            <Text size="small" skin="muted">
              Đóng góp {formatNumber(card.contributionPct, 1)}%
              {card.contributionWorkspaces !== undefined ? ` trên ${card.contributionWorkspaces} nhóm` : ''}
            </Text>
          ) : null}
          {card.portfolioUrl ? (
            <a
              className="text-body-14 text-link hover:underline"
              href={card.portfolioUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Xem portfolio
            </a>
          ) : null}
        </div>
        {openOffer ? (
          <Callout
            action={
              <Button asChild size="sm" variant="stroke">
                <Link to={offerHref(openOffer.id)}>Xem lời mời</Link>
              </Button>
            }
            description={`Bạn đã có một lời mời đang mở với ứng viên này (${OFFER_STATUS_META[openOffer.status].label}).`}
            intent="info"
          />
        ) : null}
        <section aria-label="Huy hiệu kỹ năng" className="flex flex-col gap-2">
          <Text size="small" weight="medium">
            Kỹ năng đã xác thực
          </Text>
          <TalentBadgeList badges={badges} onViewProof={setProofSkillId} />
        </section>
        <Text size="tiny" skin="muted">
          Lượt xem hồ sơ được ghi nhận vào nhật ký và tính vào giới hạn xem trong ngày.
        </Text>
      </div>
    );
    if (canOffer && !openOffer) {
      footer = (
        <Button
          size="sm"
          onClick={() => onSendOffer({ userId: card.userId, displayName: card.displayName })}
        >
          Gửi lời mời
        </Button>
      );
    }
  } else if (isError && errorStatusOf(error) !== 404 && errorCodeOf(error) !== PORTAL_ERROR.viewLimit) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được hồ sơ ứng viên"
      />
    );
  } else if (isLoading || isError) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full" height={48} />
        <Skeleton className="w-full" height={120} />
      </div>
    );
  }

  return (
    <>
      <Drawer
        footer={footer}
        open={userId !== null}
        side="right"
        size="lg"
        title={profile?.card.displayName ?? 'Hồ sơ ứng viên'}
        onOpenChange={handleOpenChange}
      >
        {body}
      </Drawer>
      <TalentProofDrawer
        companyId={companyId}
        skillId={proofSkillId}
        userId={userId}
        onClose={() => setProofSkillId(null)}
      />
    </>
  );
});

export default TalentProfileDrawer;
