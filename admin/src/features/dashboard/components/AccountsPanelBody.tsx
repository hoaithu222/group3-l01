import { memo } from 'react';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../constants/breakdown.constants';
import { colorOfUserRole, colorOfUserStatus, sumCounts } from '../utils/breakdown.utils';
import BreakdownDonutLegend from './BreakdownDonutLegend';
import BreakdownLegend from './BreakdownLegend';

export interface AccountsPanelBodyProps {
  /** `breakdowns.userStatus` — tình trạng tài khoản (snapshot). */
  userStatus: readonly InsightsBreakdownItem[];
  /** `breakdowns.userRole` — vai trò hệ thống. */
  userRole: readonly InsightsBreakdownItem[];
}

/**
 * Thân panel "Tài khoản": donut tình trạng (màu ĐÚNG nghĩa — lục ổn · đỏ khoá · cam chờ xoá · xám ẩn danh) + chú giải, bên dưới là cơ cấu vai trò
 * dạng thanh nhỏ (vai trò chỉ 2–3 giá trị nên một donut thứ hai là thừa, thanh ngang đọc nhanh hơn).
 *
 * Tâm donut ghi "tài khoản" chứ không "người dùng": tổng ở đây cộng CẢ tài khoản đã ẩn danh, còn thẻ KPI "Tổng người dùng" đã trừ chúng — hai con số
 * khác nhau trên cùng một trang mà cùng nhãn "người dùng" sẽ đọc như lệch số.
 */
const AccountsPanelBody = memo(function AccountsPanelBody({
  userStatus,
  userRole,
}: AccountsPanelBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <BreakdownDonutLegend
        centerLabel="tài khoản"
        centerValue={sumCounts(userStatus)}
        colorOf={colorOfUserStatus}
        items={userStatus}
        labels={USER_STATUS_LABELS}
      />
      <div className="flex min-h-0 flex-col gap-1 border-t border-border-1 pt-2">
        <p className="text-caption-12 text-fg-4">Vai trò</p>
        <BreakdownLegend
          colorOf={colorOfUserRole}
          items={userRole}
          labels={USER_ROLE_LABELS}
          showBar
        />
      </div>
    </div>
  );
});

export default AccountsPanelBody;
