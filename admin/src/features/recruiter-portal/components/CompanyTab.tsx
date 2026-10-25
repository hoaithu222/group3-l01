import { memo } from 'react';

import { BoxPanel, Divider, PageBody } from '@/shared/ui';

import type { MyCompany } from '../types/portal.types';
import CompanyMembersTable from './CompanyMembersTable';
import CompanyProfileForm from './CompanyProfileForm';
import CompanyUsageCard from './CompanyUsageCard';

export interface CompanyTabProps {
  me: MyCompany;
}

/**
 * Tab `company` của `/recruiter/portal` (admin.md p6-08 §2.7): hồ sơ (form, OWNER sửa) · gói & hạn mức · thành viên (OWNER thêm/gỡ). Khả dụng ở MỌI trạng thái doanh nghiệp — kể cả chờ duyệt/bị từ chối/tạm ngưng
 * (OWNER cần sửa hồ sơ và gửi duyệt lại khi bị từ chối). Form KHÔNG remount khi `version` đổi: sau `RES_003` (người khác vừa sửa) hồ sơ được tải lại nhưng nội dung người dùng đang nhập phải còn nguyên để so và lưu lại — lần lưu kế dùng `version` mới.
 */
const CompanyTab = memo(function CompanyTab({ me }: CompanyTabProps) {
  const isOwner = me.membership.role === 'OWNER';

  return (
    <PageBody overflow="scroll">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BoxPanel border="hairline" title="Hồ sơ doanh nghiệp">
          <div className="p-3">
            <CompanyProfileForm company={me.company} isOwner={isOwner} />
          </div>
        </BoxPanel>
        <BoxPanel border="hairline" title="Gói và thành viên">
          <div className="flex flex-col gap-4 p-3">
            <CompanyUsageCard companyId={me.company.id} />
            <Divider />
            <CompanyMembersTable
              canAdd={me.company.status === 'APPROVED'}
              companyId={me.company.id}
              isOwner={isOwner}
            />
          </div>
        </BoxPanel>
      </div>
    </PageBody>
  );
});

export default CompanyTab;
