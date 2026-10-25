/**
 * `walletReminderTargetLabel` (p6-04 admin.md §2.1) — "nơi đăng nhắc": nhóm chat
 * riêng chỉ hiện LOẠI, kênh công khai hiện tên.
 */
import { describe, expect, it } from 'vitest';

import type { WalletReminderTargetType } from '@/features/workspace/types/workspace-wallet.types';
import { walletReminderTargetLabel } from '@/features/workspace/utils/workspace-wallet.utils';

const label = (targetType: WalletReminderTargetType, targetChannelName: string | null) =>
  walletReminderTargetLabel({ targetType, targetChannelName });

describe('walletReminderTargetLabel', () => {
  it('NONE → "Không đăng"', () => {
    expect(label('NONE', null)).toBe('Không đăng');
  });

  it('CONVERSATION → "Nhóm chat", bỏ qua tên dù BE lỡ gửi kèm', () => {
    expect(label('CONVERSATION', null)).toBe('Nhóm chat');
    expect(label('CONVERSATION', 'Nhóm kín của phòng Kế toán')).toBe('Nhóm chat');
  });

  it('CHANNEL có tên (kênh công khai) → tên kênh, đã cắt khoảng trắng', () => {
    expect(label('CHANNEL', '  chi-tieu-chung ')).toBe('chi-tieu-chung');
  });

  it('CHANNEL không tên hoặc tên rỗng (kênh riêng tư) → "Kênh riêng tư"', () => {
    expect(label('CHANNEL', null)).toBe('Kênh riêng tư');
    expect(label('CHANNEL', '   ')).toBe('Kênh riêng tư');
  });

  it('loại lạ (BE thêm mới) → "—"', () => {
    expect(label('EMAIL' as WalletReminderTargetType, null)).toBe('—');
  });
});
