import { memo, useCallback, useMemo, useState } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, PageBody } from '@/shared/ui';

import { TALENT_DRAWER_PARAM } from '../constants/portal.constants';
import { useTalentFilters } from '../hooks/useTalentFilters';
import { useSkillOptions, useTalentSearch } from '../service/talent.queries';
import type { TalentCard } from '../types/talent.types';
import { errorCodeOf, errorStatusOf } from '../utils/portal-errors';
import SendOfferModal from './SendOfferModal';
import TalentFilters from './TalentFilters';
import TalentProfileDrawer from './TalentProfileDrawer';
import TalentResults from './TalentResults';
import ViewLimitBanner from './ViewLimitBanner';

export interface TalentTabProps {
  companyId: string;
  /** `recruiter:create` — cho phép "Gửi lời mời". */
  canOffer: boolean;
  /** Làm mới `GET /me/company` (khi BE báo `RECR_002` giữa chừng) để banner trạng thái hiện. */
  onCompanyStatusChanged: () => void;
}

interface LimitState {
  id: number;
  seconds: number | null;
}

/**
 * Tab `talent` của `/recruiter/portal` (admin.md p6-08 §2.4) — CHỈ được dựng khi doanh nghiệp APPROVED (trang chặn trạng thái khác bằng `CompanyStatusCallout` và KHÔNG gọi API ở đây).
 * Bộ lọc trái (URL-synced, debounce 400 ms) + lưới kết quả (cursor "Tải thêm") + ngăn kéo hồ sơ (`?userId=`, mở trên nền danh sách) + modal gửi lời mời (dựng MỚI mỗi lần mở).
 * `RECR_010` từ ngăn kéo → banner đếm ngược thay cho lưới không bị xoá; hết giờ thì tự gỡ.
 */
const TalentTab = memo(function TalentTab({ companyId, canOffer, onCompanyStatusChanged }: TalentTabProps) {
  const filters = useTalentFilters();
  const qp = useQueryParams({ resetPageOnChange: false });
  const { getParam, updateParams, searchParams } = qp;
  const [sendTo, setSendTo] = useState<{ userId: string; displayName: string } | null>(null);
  const [limit, setLimit] = useState<LimitState | null>(null);

  const skills = useSkillOptions();
  const search = useTalentSearch(companyId, filters.params, true);

  const talents = useMemo<TalentCard[]>(() => {
    const seen = new Map<string, TalentCard>();
    for (const page of search.data?.pages ?? []) for (const t of page.data) seen.set(t.userId, t);
    return [...seen.values()];
  }, [search.data]);

  const openUserId = getParam(TALENT_DRAWER_PARAM) || null;
  const hrefFor = useCallback(
    (userId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set(TALENT_DRAWER_PARAM, userId);
      return `?${next.toString()}`;
    },
    [searchParams],
  );
  const handleOpen = useCallback((userId: string) => updateParams({ [TALENT_DRAWER_PARAM]: userId }), [updateParams]);
  const handleClose = useCallback(() => updateParams({ [TALENT_DRAWER_PARAM]: null }), [updateParams]);
  const offerHref = useCallback((offerId: string) => `?tab=offers&offerId=${encodeURIComponent(offerId)}`, []);
  const handleViewLimit = useCallback((seconds: number | null) => setLimit({ id: Date.now(), seconds }), []);
  const handleLimitExpire = useCallback(() => setLimit(null), []);

  const searchError = search.isError ? search.error : null;
  const errorView =
    searchError && talents.length === 0
      ? {
          retry: () => void search.refetch(),
          title:
            errorCodeOf(searchError) === 'RECR_002'
              ? 'Doanh nghiệp không còn được duyệt'
              : 'Không tải được danh sách ứng viên',
          description:
            errorStatusOf(searchError) === 403
              ? 'Doanh nghiệp chưa được duyệt hoặc đang tạm ngưng nên chưa tìm được ứng viên.'
              : 'Kiểm tra kết nối rồi thử lại.',
        }
      : null;

  return (
    <PageBody overflow="scroll">
      <div className="flex flex-col gap-3">
        {limit ? <ViewLimitBanner key={limit.id} seconds={limit.seconds} onExpire={handleLimitExpire} /> : null}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[288px_minmax(0,1fr)]">
          <BoxPanel border="hairline" title="Tìm ứng viên">
            <div className="p-3">
              <TalentFilters
                hasFilter={filters.hasFilter}
                skillOptions={skills.data ?? []}
                skillsLoading={skills.isPending}
                values={filters.values}
                onClear={filters.clear}
                onKeywordChange={filters.setKeyword}
                onLocationChange={filters.setLocation}
                onMinBadgesChange={filters.setMinBadges}
                onMinContributionChange={filters.setMinContribution}
                onRoleChange={filters.setRole}
                onSkillsChange={filters.setSkills}
              />
            </div>
          </BoxPanel>
          <TalentResults
            error={errorView}
            hasMore={!!search.hasNextPage}
            hrefFor={hrefFor}
            loading={search.isLoading}
            loadingMore={search.isFetchingNextPage}
            matchedCodes={filters.values.skills}
            talents={talents}
            onLoadMore={() => void search.fetchNextPage()}
            onOpen={handleOpen}
          />
        </div>
      </div>
      <TalentProfileDrawer
        canOffer={canOffer}
        companyId={companyId}
        offerHref={offerHref}
        userId={openUserId}
        onClose={handleClose}
        onSendOffer={setSendTo}
        onViewLimit={handleViewLimit}
      />
      {sendTo ? (
        <SendOfferModal
          companyId={companyId}
          open
          student={sendTo}
          onCompanyStatusChanged={onCompanyStatusChanged}
          onOpenChange={(next) => !next && setSendTo(null)}
        />
      ) : null}
    </PageBody>
  );
});

export default TalentTab;
