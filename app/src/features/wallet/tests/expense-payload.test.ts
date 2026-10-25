import type { ExpenseDetailView } from '../api';
import {
  buildAdjustPayload,
  buildCreatePayload,
  buildUpdatePayload,
  toOccurredAtIso,
} from '../utils/expense-payload';
import { splitDraftForTest } from './helpers';

describe('payload khoản chi', () => {
  const values = {
    amount: 150000,
    category: 'FOOD' as const,
    description: 'Ăn trưa',
    occurredAt: new Date(2026, 8, 10, 0, 0, 0),
    paidBy: 'A',
    split: splitDraftForTest(),
  };

  it('ngày chi ghim 12:00 giờ máy (không lùi một ngày do UTC); hôm nay giữ giờ hiện tại', () => {
    const iso = toOccurredAtIso(new Date(2026, 8, 10, 0, 0, 0), new Date(2026, 8, 19, 20, 0, 0));
    expect(new Date(iso).getHours()).toBe(12);
    expect(new Date(iso).getDate()).toBe(10);

    const now = new Date(2026, 8, 19, 20, 30, 0);
    expect(toOccurredAtIso(new Date(2026, 8, 19, 0, 0, 0), now)).toBe(now.toISOString());
  });

  it('tạo: EQUAL không kèm amount/bps; chỉ gửi receiptAssetId khi có', () => {
    const payload = buildCreatePayload(values, undefined);
    expect(payload.participants).toEqual([{ userId: 'A' }, { userId: 'B' }]);
    expect('receiptAssetId' in payload).toBe(false);
    expect(buildCreatePayload(values, 'asset1').receiptAssetId).toBe('asset1');
  });

  it('điều chỉnh: bản khai đầy đủ, không có trường của khoản gốc (người trả/ngày/danh mục)', () => {
    expect(Object.keys(buildAdjustPayload(values)).sort()).toEqual([
      'amount',
      'description',
      'participants',
      'splitType',
    ]);
  });

  const original = {
    adjustments: [],
    adjustsExpenseId: null,
    amount: 150000,
    canManage: true,
    category: 'FOOD',
    createdAt: '2026-09-10T05:00:00.000Z',
    createdBy: 'A',
    description: 'Ăn trưa',
    id: 'e1',
    kind: 'EXPENSE',
    myShare: null,
    occurredAt: new Date(2026, 8, 10, 12, 0, 0).toISOString(),
    paidBy: 'A',
    participants: [
      { amount: null, bps: null, userId: 'A' },
      { amount: null, bps: null, userId: 'B' },
    ],
    receiptAssetId: null,
    shares: [],
    splitType: 'EQUAL',
    version: 3,
    workspaceId: 'w',
  } satisfies ExpenseDetailView;

  it('sửa: KHÔNG đổi gì thì chỉ có expectedVersion', () => {
    expect(buildUpdatePayload(values, original, undefined)).toEqual({ expectedVersion: 3 });
  });

  it('sửa mô tả thôi thì không kéo theo amount/participants (khỏi kích hoạt kiểm tổng chia oan)', () => {
    expect(buildUpdatePayload({ ...values, description: 'Ăn tối' }, original, undefined)).toEqual({
      description: 'Ăn tối',
      expectedVersion: 3,
    });
  });

  it('đổi số tiền thì gửi CẢ amount + splitType + participants cùng nhau', () => {
    const payload = buildUpdatePayload({ ...values, amount: 200000 }, original, undefined);
    expect(payload).toMatchObject({ amount: 200000, expectedVersion: 3, splitType: 'EQUAL' });
    expect(payload.participants).toEqual([{ userId: 'A' }, { userId: 'B' }]);
  });

  it('thứ tự chọn người khác nhưng cùng tập hợp ⇒ không coi là đổi cách chia', () => {
    const reversed = { ...values, split: { ...values.split, selected: ['B', 'A'] } };
    expect(buildUpdatePayload(reversed, original, undefined)).toEqual({ expectedVersion: 3 });
  });

  it('ảnh: undefined = không đụng · null = gỡ · id mới = thay', () => {
    expect('receiptAssetId' in buildUpdatePayload(values, original, undefined)).toBe(false);
    expect(
      buildUpdatePayload(values, { ...original, receiptAssetId: 'old' }, null).receiptAssetId,
    ).toBeNull();
    expect(buildUpdatePayload(values, original, 'new').receiptAssetId).toBe('new');
  });
});
