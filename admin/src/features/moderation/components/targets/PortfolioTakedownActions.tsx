import { memo, useState } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { PORTFOLIO_NOT_TAKEN_DOWN_CODE } from '../../service/portfolio-moderation.api';
import { useRestorePortfolio, useTakedownPortfolio } from '../../service/portfolio-moderation.queries';
import type { AdminReportGroup } from '../../types/moderation.types';
import type { AdminPortfolio } from '../../types/portfolio-moderation.types';
import { errorCodeOf } from '../../utils/report-errors';

export interface PortfolioTakedownActionsProps {
  portfolio: AdminPortfolio;
  /** Nhóm báo cáo đang xem — `groupKey` được gửi kèm khi gỡ để audit biết gỡ vì báo cáo nào. */
  group: Pick<AdminReportGroup, 'groupKey'>;
  /** `moderation:update` — không có thì không nút nào hiện. */
  canUpdate: boolean;
}

type Decision = 'TAKEDOWN' | 'RESTORE';

const TAKEDOWN_IMPACT =
  'Trang /p/… trả 404 NGAY, chủ hồ sơ nhận thông báo kèm lý do và không tự đăng lại được cho tới khi bạn mở lại. Mọi báo cáo đang mở của hồ sơ được đóng (kết quả "Đã gỡ nội dung"). Hành động này ghi nhật ký quản trị.';
const RESTORE_IMPACT =
  'Hồ sơ được phép công khai trở lại nhưng KHÔNG tự đăng lại — chủ hồ sơ phải tự bấm "Công khai". Hành động này ghi nhật ký quản trị.';

/**
 * Khối "Xử lý portfolio" (p6-07): **Gỡ portfolio** (hồ sơ chưa bị gỡ) / **Mở lại** (đã bị gỡ) — `moderation:update`, lý do ≥ 10 ký tự qua
 * `ConfirmWithReasonModal`, BE ghi audit `portfolio.takedown|restore`. Đứng riêng khỏi `ReportDecisionBar` vì gỡ trang đóng luôn báo cáo mở,
 * còn "Mở lại" phải dùng được SAU khi báo cáo đã đóng (khối quyết định của báo cáo khi đó chỉ đọc).
 */
const PortfolioTakedownActions = memo(function PortfolioTakedownActions({
  portfolio,
  group,
  canUpdate,
}: PortfolioTakedownActionsProps) {
  // `decision` giữ nguyên khi đóng modal để nội dung không nháy sang quyết định kia lúc đang trượt ra.
  const [decision, setDecision] = useState<Decision>('TAKEDOWN');
  const { close, isOpen, open } = useDisclosure();
  const takedown = useTakedownPortfolio();
  const restore = useRestorePortfolio();

  if (!canUpdate) return null;
  const takenDown = !!portfolio.takenDownAt;

  const choose = (next: Decision) => {
    setDecision(next);
    open();
  };

  return (
    <BoxPanel border="hairline" title="Xử lý portfolio">
      <div className="flex flex-col gap-2 p-3">
        {!takenDown && portfolio.status !== 'PUBLISHED' && (
          <Callout
            description="Hồ sơ hiện không công khai (nháp hoặc đã ngừng công khai). Vẫn có thể gỡ để chặn chủ hồ sơ đăng lại trang vi phạm."
            intent="neutral"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {takenDown ? (
            <Button
              size="sm"
              startIcon={<SystemIcon name="eye-outline" size={14} />}
              variant="stroke"
              onClick={() => choose('RESTORE')}
            >
              Mở lại portfolio
            </Button>
          ) : (
            <Button
              size="sm"
              skin="danger"
              startIcon={<SystemIcon name="eye-slash-outline" size={14} />}
              variant="stroke"
              onClick={() => choose('TAKEDOWN')}
            >
              Gỡ portfolio
            </Button>
          )}
        </div>
      </div>
      <ConfirmWithReasonModal
        confirmLabel={decision === 'TAKEDOWN' ? 'Gỡ portfolio' : 'Mở lại'}
        confirmTone={decision === 'TAKEDOWN' ? 'danger' : 'primary'}
        impact={decision === 'TAKEDOWN' ? TAKEDOWN_IMPACT : RESTORE_IMPACT}
        open={isOpen}
        title={
          decision === 'TAKEDOWN'
            ? `Gỡ portfolio — ${portfolio.displayName}`
            : `Mở lại portfolio — ${portfolio.displayName}`
        }
        onConfirm={async (reason) => {
          if (decision === 'TAKEDOWN') {
            await takedown.mutateAsync({
              portfolioId: portfolio.id,
              reason,
              reportGroupKey: group.groupKey,
            });
          } else {
            try {
              await restore.mutateAsync({ portfolioId: portfolio.id, reason });
            } catch (err) {
              // `PORT_012`: người khác vừa mở lại — interceptor đã toast, hook đã làm mới; hành động không bao giờ thành công được nữa
              // nên đóng hộp thoại (giữ mở là vô nghĩa). Lỗi khác ném tiếp ⇒ hộp thoại giữ mở để thử lại.
              if (errorCodeOf(err) !== PORTFOLIO_NOT_TAKEN_DOWN_CODE) throw err;
            }
          }
        }}
        onOpenChange={(next) => (next ? open() : close())}
      />
    </BoxPanel>
  );
});

export default PortfolioTakedownActions;
