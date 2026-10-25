import { memo, type ReactNode } from 'react';

import { Badge, BoxPanel, type SystemIconName } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { WalletReminderView } from '../types/workspace-wallet.types';
import { walletReminderTargetLabel } from '../utils/workspace-wallet.utils';

interface StatusRowProps {
  icon: SystemIconName;
  label: string;
  children: ReactNode;
}

/** Hàng "icon · nhãn · giá trị" — nhãn bề rộng cố định để cột thẳng hàng. */
const StatusRow = memo(function StatusRow({ icon, label, children }: StatusRowProps) {
  return (
    <div className="flex items-start gap-2 border-b border-divider-1 py-2 last:border-b-0">
      <SystemIcon className="mt-0.5 shrink-0 text-fg-4" name={icon} size={14} />
      <span className="w-36 shrink-0 text-body-14 text-fg-3">{label}</span>
      <div className="min-w-0 flex-1 break-words text-body-14 text-fg-1">{children}</div>
    </div>
  );
});

export interface WalletStatusPanelProps {
  /** Ví của workspace bật/tắt. */
  enabled: boolean;
  reminder: WalletReminderView;
}

/**
 * Khối "Trạng thái" của tab ví (p6-04 admin.md §2.1) — CHỈ đọc: ví bật/tắt, nhắc
 * nợ bật/tắt, lịch nhắc (chuỗi server đã định dạng, in nguyên văn) và nơi đăng
 * nhắc (loại đích; tên chỉ có với kênh công khai, xem `walletReminderTargetLabel`).
 */
const WalletStatusPanel = memo(function WalletStatusPanel({
  enabled,
  reminder,
}: WalletStatusPanelProps) {
  return (
    <BoxPanel border="hairline" className="h-auto" title="Trạng thái">
      <div className="px-2">
        <StatusRow icon="wallet-bold" label="Ví nhóm">
          <Badge color={enabled ? 'success' : 'neutral'} variant="tinted">
            {enabled ? 'Đang bật' : 'Đang tắt'}
          </Badge>
        </StatusRow>
        <StatusRow icon="bell-bold" label="Nhắc nợ định kỳ">
          <Badge color={reminder.enabled ? 'success' : 'neutral'} variant="tinted">
            {reminder.enabled ? 'Đang bật' : 'Đang tắt'}
          </Badge>
        </StatusRow>
        <StatusRow icon="calendar-clock-bold" label="Lịch nhắc">
          {reminder.cronText || '—'}
        </StatusRow>
        <StatusRow icon="message-bold" label="Nơi đăng nhắc">
          {walletReminderTargetLabel(reminder)}
        </StatusRow>
      </div>
    </BoxPanel>
  );
});

export default WalletStatusPanel;
