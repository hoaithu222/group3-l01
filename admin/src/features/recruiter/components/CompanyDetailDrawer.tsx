import { memo, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/app/store';
import { useDisclosure } from '@/shared/hooks';
import { Button, Callout, Drawer, EmptyState, Skeleton, Tabs } from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { useAdminCompany } from '../service/recruiter.queries';
import type { CompanyAction } from '../types/recruiter.types';
import { isUnavailableError } from '../utils/load-error';
import CompanyActionModal from './CompanyActionModal';
import CompanyActions from './CompanyActions';
import CompanyEditModal from './CompanyEditModal';
import CompanyInfoTab from './CompanyInfoTab';
import CompanyMembersTab from './CompanyMembersTab';
import CompanyTierModal from './CompanyTierModal';
import CompanyUsageTab from './CompanyUsageTab';

export interface CompanyDetailDrawerProps {
  /** `null` = đóng. */
  companyId: string | null;
  onClose: () => void;
}

type DrawerTab = 'info' | 'members' | 'usage' | 'audit';

const TABS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'members', label: 'Thành viên' },
  { key: 'usage', label: 'Sử dụng' },
  { key: 'audit', label: 'Nhật ký' },
];

/** Loại đối tượng của bản ghi audit BE ghi cho doanh nghiệp (`targetType: "Company"`). */
const AUDIT_TARGET_TYPE = 'Company';

/**
 * Ngăn kéo chi tiết doanh nghiệp (admin.md p6-08 §2.1) — Thông tin · Thành viên · Sử dụng · Nhật ký + hành động theo quyền.
 * `open` suy từ `companyId !== null` (URL `?companyId=`); deep-link `/recruiter/companies/:id` chỉ redirect về đây để danh sách vẫn ở phía sau.
 *
 * Ba trạng thái tải KHÔNG gộp: đang tải (khung xương) · không xem được (403/404 → nói rõ, KHÔNG "Thử lại") · lỗi tạm thời (Callout + "Thử lại").
 * Hành động ghi mở hộp thoại riêng; sau khi thành công hook làm mới nên ngăn kéo tự hiện trạng thái mới (không đóng).
 */
const CompanyDetailDrawer = memo(function CompanyDetailDrawer({
  companyId,
  onClose,
}: CompanyDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('info');
  const [action, setAction] = useState<CompanyAction | null>(null);
  const tierModal = useDisclosure();
  const editModal = useDisclosure();
  const canApprove = useAuthStore((s) => s.hasPermission('recruiter', 'approve'));
  const canUpdate = useAuthStore((s) => s.hasPermission('recruiter', 'update'));

  const { data: detail, isLoading, isError, error, refetch } = useAdminCompany(
    companyId ?? undefined,
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTab('info');
      onClose();
    }
  };

  let body: ReactNode;
  if (detail) {
    const { company } = detail;
    body = (
      <div className="flex h-full flex-col gap-3">
        <CompanyActions
          canApprove={canApprove}
          canUpdate={canUpdate}
          company={company}
          onAction={setAction}
          onEdit={editModal.open}
          onTier={tierModal.open}
        />
        <Tabs
          aria-label="Thông tin doanh nghiệp"
          options={TABS}
          size="sm"
          value={tab}
          onValueChange={(v) => setTab(v as DrawerTab)}
        />
        {tab === 'info' && <CompanyInfoTab detail={detail} />}
        {tab === 'members' && <CompanyMembersTab members={detail.members} />}
        {tab === 'usage' && <CompanyUsageTab detail={detail} />}
        {tab === 'audit' && <AuditTrailPanel targetId={company.id} targetType={AUDIT_TARGET_TYPE} />}
        <CompanyActionModal action={action} company={company} onClose={() => setAction(null)} />
        {tierModal.isOpen ? (
          <CompanyTierModal
            company={company}
            currentQuota={detail.quota}
            open
            onOpenChange={(next) => !next && tierModal.close()}
          />
        ) : null}
        {editModal.isOpen ? (
          <CompanyEditModal
            company={company}
            open
            onOpenChange={(next) => !next && editModal.close()}
          />
        ) : null}
      </div>
    );
  } else if (isError && isUnavailableError(error)) {
    body = (
      <EmptyState
        description="Doanh nghiệp không còn tồn tại hoặc bạn không có quyền xem."
        icon="building-bold"
        size="sm"
        title="Không xem được doanh nghiệp"
      />
    );
  } else if (isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được doanh nghiệp"
      />
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full" height={32} />
        <Skeleton className="w-full" height={160} />
        <Skeleton className="w-3/5" height={32} />
      </div>
    );
  }

  return (
    <Drawer
      open={companyId !== null}
      side="right"
      size="lg"
      title={detail?.company.name ?? 'Doanh nghiệp'}
      onOpenChange={handleOpenChange}
    >
      {body}
    </Drawer>
  );
});

export default CompanyDetailDrawer;
