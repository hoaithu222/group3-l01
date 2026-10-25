import type { AxiosError } from 'axios';
import { memo, type ReactNode } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { Callout, EmptyState, Skeleton } from '@/shared/ui';

import { WALLET_FEATURE_OFF_CODE } from '../../constants/workspace-wallet.constants';
import { useWorkspaceWalletStats } from '../../service/workspace.queries';
import WalletMetricsPanel from '../WalletMetricsPanel';
import WalletSpendBandPanel from '../WalletSpendBandPanel';
import WalletStatusPanel from '../WalletStatusPanel';
import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceWalletTabProps {
  workspaceId: string;
}

/**
 * Tab "Ví (thống kê)" của `WorkspaceDetailPage` (p6-04 admin.md §2.1) — CHỈ đọc,
 * KHÔNG có hành động nào: ví là dữ liệu của nhóm, admin không xem khoản chi, số
 * dư từng người, settlement hay tài khoản ngân hàng. Chỉ số đếm ẩn danh + dải giá
 * trị. Trang cha chỉ mount tab này khi cờ `wallet` bật và có quyền `workspace:view`.
 *
 * Cờ tắt giữa chừng (capabilities cache 5 phút) ⇒ BE trả 404 `CFG_005`: hiện trạng
 * thái "ví đang tắt" thay vì báo lỗi.
 */
const WorkspaceWalletTab = memo(function WorkspaceWalletTab({ workspaceId }: WorkspaceWalletTabProps) {
  const { data, isLoading, error, refetch } = useWorkspaceWalletStats(workspaceId);
  const stats = data?.data;

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div
        aria-busy="true"
        aria-label="Đang tải thống kê ví"
        className="flex flex-col gap-2"
        role="status"
      >
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  } else if (!stats) {
    const featureOff = error ? extractErrorCode(error as AxiosError) === WALLET_FEATURE_OFF_CODE : false;
    body = featureOff ? (
      <EmptyState
        description="Tính năng ví nhóm đang tắt trên hệ thống nên chưa có thống kê."
        icon="wallet-bold"
        title="Ví nhóm đang tắt"
      />
    ) : (
      <WorkspaceLoadError
        error={error}
        title="Không tải được thống kê ví"
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = (
      <>
        <WalletStatusPanel enabled={stats.enabled} reminder={stats.reminder} />
        <WalletMetricsPanel last30d={stats.last30d} />
        <WalletSpendBandPanel last30d={stats.last30d} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Callout
        description="Vì quyền riêng tư, trang quản trị chỉ hiển thị số liệu tổng hợp ẩn danh. Khoản chi, số dư từng người, giao dịch trả nợ và tài khoản ngân hàng của nhóm không được hiển thị ở đây."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {body}
    </div>
  );
});

export default WorkspaceWalletTab;
