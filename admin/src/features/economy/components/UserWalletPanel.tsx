import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { useUser } from '@/features/user';
import { useDisclosure, useNavHref } from '@/shared/hooks';
import { Button, CopyableText, Skeleton, Text, Toolbar } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { useUserWallet } from '../service/economy.queries';
import { shortId } from '../utils/economy-format.utils';
import AdjustCoinsModal from './AdjustCoinsModal';
import EconomyLoadError from './EconomyLoadError';
import WalletLedgerTable from './WalletLedgerTable';

export interface UserWalletPanelProps {
  userId: string;
}

/**
 * Ví xu của MỘT người (admin.md p7-02 §2.2): số dư, tổng đã nhận/đã tiêu, nhận hôm nay/trần ngày, sổ cái, và nút "Điều chỉnh xu" (chỉ khi có `gamification:update`).
 * Tên người dùng lấy từ hồ sơ khi admin có `user:view`; không có quyền đó thì chỉ hiện id rút gọn (BE ví không trả tên). 404 (không tồn tại / đã ẩn danh hoá) → nói rõ, không thử lại.
 */
const UserWalletPanel = memo(function UserWalletPanel({ userId }: UserWalletPanelProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const buildHref = useNavHref();
  const adjust = useDisclosure();
  const { data: wallet, error, refetch } = useUserWallet(userId);
  const { data: user } = useUser(canViewUser ? userId : undefined);

  const label = user?.data.name ?? `người dùng ${shortId(userId)}`;
  const stats = wallet
    ? [
        { label: 'Số dư', value: `${formatNumber(wallet.balance)} xu` },
        { label: 'Tổng đã nhận', value: `${formatNumber(wallet.lifetimeEarned)} xu` },
        { label: 'Tổng đã tiêu', value: `${formatNumber(wallet.lifetimeSpent)} xu` },
        {
          label: 'Nhận hôm nay',
          value: `${formatNumber(wallet.todayEarned)}/${formatNumber(wallet.dailyCap)} xu`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <Link className="text-body-14 text-link hover:underline" to={buildHref({ userId: null })}>
            ← Chọn người dùng khác
          </Link>
        }
        right={
          canUpdate && wallet ? (
            <Button size="sm" variant="primary" onClick={adjust.open}>
              Điều chỉnh xu
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="bold">Ví xu — {label}</Text>
        <CopyableText display={shortId(userId)} label="ID người dùng" value={userId} />
      </div>
      {error && !wallet ? (
        <EconomyLoadError
          error={error}
          notFoundDescription="Không tìm thấy người dùng này (có thể tài khoản đã bị ẩn danh hoá)."
          title="Không tải được ví xu"
          onRetry={() => void refetch()}
        />
      ) : !wallet ? (
        <Skeleton className="w-full" height={96} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5">
                <dt className="text-body-13 text-fg-3">{s.label}</dt>
                <dd className="tabular-nums text-body-14-semibold text-fg-1">{s.value}</dd>
              </div>
            ))}
          </dl>
          <WalletLedgerTable userId={userId} />
          {adjust.isOpen && (
            <AdjustCoinsModal
              balance={wallet.balance}
              userId={userId}
              userLabel={label}
              onClose={adjust.close}
            />
          )}
        </>
      )}
    </div>
  );
});

export default UserWalletPanel;
