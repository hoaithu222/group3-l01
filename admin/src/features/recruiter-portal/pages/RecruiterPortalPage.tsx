import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useMatches } from 'react-router-dom';

import { PATHS } from '@/app/config';
import FeatureDisabledPage from '@/app/pages/FeatureDisabledPage';
import type { RouteHandle } from '@/app/router/modules/types';
import { useQueryParams } from '@/shared/hooks';
import { Button, Callout, PageShell, Skeleton } from '@/shared/ui';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import CompanyStatusCallout from '../components/CompanyStatusCallout';
import CompanyTab from '../components/CompanyTab';
import OffersTab from '../components/OffersTab';
import PortalNoCompany from '../components/PortalNoCompany';
import TalentTab from '../components/TalentTab';
import { PORTAL_TABS } from '../constants/portal.constants';
import type { PortalTab } from '../constants/portal.constants';
import { useOfferSocket } from '../hooks/useOfferSocket';
import { useMyCompany } from '../service/company.queries';
import { isFeatureDisabledError, isNoCompanyError } from '../utils/portal-errors';

const DEFAULT_TAB: PortalTab = 'talent';

/** Khoá URL riêng của từng tab — đổi tab thì XOÁ hết (bộ lọc ứng viên/lời mời, ngăn kéo) để URL lạ không bám theo người dùng sang tab khác. */
const TAB_SCOPED_KEYS = [
  'skills',
  'minContribution',
  'minBadges',
  'role',
  'location',
  'q',
  'status',
  'recruiterId',
  'from',
  'to',
  'userId',
  'offerId',
] as const;

const isTab = (v: string): v is PortalTab => (PORTAL_TABS as readonly string[]).includes(v);

/**
 * Trang `/recruiter/portal?tab=` — CỔNG NHÀ TUYỂN DỤNG tự phục vụ (admin.md p6-08 §2.4–2.7): `talent` Ứng viên · `offers` Lời mời · `company` Công ty. `companyId` lấy từ `GET /me/company`
 * (một người ≤ 1 doanh nghiệp), KHÔNG cho người dùng nhập. Doanh nghiệp chưa `APPROVED` → banner trạng thái (Chờ duyệt/Từ chối/Tạm ngưng) và tab Ứng viên KHÔNG được dựng nên KHÔNG gọi API ứng viên (BE trả
 * `RECR_002`). Realtime: `offer:updated`/`offer:message-created`/`company:updated` (`useOfferSocket`). Quyền vào (`recruiter:view` theo dữ liệu) và cờ `career` do registry chặn.
 * Ba trạng thái tải của `/me/company` KHÔNG gộp: đang tải · chưa có doanh nghiệp (mời đăng ký) · tính năng chưa bật (404 `CFG_005`) · lỗi tạm thời (Callout + "Thử lại").
 * Tiêu đề (dòng phụ = tên doanh nghiệp) + dải tab nằm trên THANH HEADER (`<PageHeader nav>`); dải tab CHỈ có khi đã có `me` — đang tải / lỗi / chưa có doanh nghiệp
 * thì header chỉ còn bảng tên.
 */
const RecruiterPortalPage = memo(function RecruiterPortalPage() {
  const matches = useMatches();
  const qp = useQueryParams({ resetPageOnChange: false });
  const { updateParams } = qp;
  const meQuery = useMyCompany();
  const me = meQuery.data;
  useOfferSocket(me?.company.id);

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );
  const options = useMemo(() => {
    const listed = Object.entries(handle?.tabTitles ?? {})
      .filter(([key]) => isTab(key))
      .map(([key, label]) => ({ key, label }));
    // Registry chưa khai tab nào (test dựng trang trần) → vẫn đủ ba tab.
    return listed.length > 0
      ? listed
      : [
          { key: 'talent', label: 'Ứng viên' },
          { key: 'offers', label: 'Lời mời' },
          { key: 'company', label: 'Công ty' },
        ];
  }, [handle]);

  const requested = qp.tab || handle?.defaultTab || DEFAULT_TAB;
  const active = options.some((o) => o.key === requested) ? requested : options[0].key;

  const handleTabChange = useCallback(
    (key: string) =>
      updateParams({ ...Object.fromEntries(TAB_SCOPED_KEYS.map((k) => [k, null])), tab: key }),
    [updateParams],
  );
  // Chưa có `me` → `active` undefined → không dựng nav: dải tab hiện ĐÚNG lúc hàng `<Tabs>` cũ hiện (chỉ nhánh `me`).
  const nav = useQueryTabNav({
    active: me ? active : undefined,
    onSelect: handleTabChange,
    options,
    resetKeys: TAB_SCOPED_KEYS,
  });
  const { refetch } = meQuery;
  const handleStatusChanged = useCallback(() => void refetch(), [refetch]);

  let body: ReactNode;
  if (me) {
    const { company, membership, permissions } = me;
    const approved = company.status === 'APPROVED';
    const canOffer = approved && permissions.includes('company.offer');
    body = (
      <>
        {approved ? null : (
          <CompanyStatusCallout
            company={company}
            isOwner={membership.role === 'OWNER'}
            onEditCompany={() => handleTabChange('company')}
          />
        )}
        {/* Tab Ứng viên CHỈ dựng khi APPROVED: chưa duyệt thì banner ở trên thay nội dung và cổng KHÔNG gọi API ứng viên. */}
        {active === 'talent' && approved ? (
          <TalentTab canOffer={canOffer} companyId={company.id} onCompanyStatusChanged={handleStatusChanged} />
        ) : null}
        {active === 'offers' ? <OffersTab canWithdraw={canOffer} companyId={company.id} /> : null}
        {active === 'company' ? <CompanyTab me={me} /> : null}
      </>
    );
  } else if (meQuery.isError && isFeatureDisabledError(meQuery.error)) {
    body = <FeatureDisabledPage />;
  } else if (meQuery.isError && isNoCompanyError(meQuery.error)) {
    body = <PortalNoCompany signupPath={PATHS.RECRUITER_SIGNUP} />;
  } else if (meQuery.isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void meQuery.refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được thông tin doanh nghiệp"
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full" height={32} />
        <Skeleton className="w-full" height={160} />
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader nav={nav} subtitle={me?.company.name} title="Tuyển dụng" tone="pink" />
      {body}
    </PageShell>
  );
});

export default RecruiterPortalPage;
