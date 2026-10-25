/**
 * Hàm thuần của tab "Ghi hình" (p2-06 admin.md §2): đọc/ghi bộ lọc từ URL (URL do người dùng sửa được ⇒ giá trị lạ không được làm hỏng truy vấn),
 * vòng sắp xếp cột, định dạng thời lượng/hạn lưu trữ, luật nút Xoá và nhãn trạng thái bản ghi.
 */
import { describe, expect, it } from 'vitest';

import type { AdminRecordingDetail } from '@/features/workspace/types/workspace-recordings.types';
import {
  canDeleteRecording,
  deleteBlockedReason,
  formatRecordingDuration,
  nextRecordingSort,
  objectStatusOf,
  parseRecordingSort,
  parseRecordingStatuses,
  retentionLabel,
  storageDeltaText,
  toRecordingListParams,
  toRecordingSortUrl,
} from '@/features/workspace/utils/workspace-recordings.utils';
import { formatFileSize, statusBadge } from '@/shared/utils/format';

const base = {
  page: 1,
  limit: 20,
  status: '',
  from: '',
  to: '',
  sort: '',
  expiring: false,
  includeDeleted: false,
};

describe('parseRecordingStatuses', () => {
  it('giữ giá trị hợp lệ theo thứ tự vòng đời, bỏ trùng và giá trị lạ (kể cả chữ thường)', () => {
    expect(parseRecordingStatuses('FAILED,READY,READY,BOGUS,ready')).toEqual(['READY', 'FAILED']);
    expect(parseRecordingStatuses(' STARTING , STOPPING ')).toEqual(['STARTING', 'STOPPING']);
  });
  it('rỗng hoặc toàn giá trị lạ → không lọc', () => {
    expect(parseRecordingStatuses('')).toEqual([]);
    expect(parseRecordingStatuses('x,y')).toEqual([]);
  });
});

describe('sắp xếp', () => {
  it('parseRecordingSort: khoá hợp lệ + chiều; thiếu/lạ → bắt đầu ghi mới → cũ', () => {
    expect(parseRecordingSort('durationSec')).toEqual({ key: 'durationSec', dir: 'asc' });
    expect(parseRecordingSort('-fileSizeBytes')).toEqual({ key: 'fileSizeBytes', dir: 'desc' });
    expect(parseRecordingSort('-retentionExpiresAt')).toEqual({
      key: 'retentionExpiresAt',
      dir: 'desc',
    });
    for (const bad of ['', 'x', '-', 'meeting', '--startedAt', 'startedAt desc'])
      expect(parseRecordingSort(bad)).toEqual({ key: 'startedAt', dir: 'desc' });
  });

  it('toRecordingSortUrl: bỏ sắp xếp/đúng mặc định/cột không sắp được → null (URL sạch)', () => {
    expect(toRecordingSortUrl(null, null)).toBeNull();
    expect(toRecordingSortUrl('startedAt', null)).toBeNull();
    expect(toRecordingSortUrl('startedAt', 'desc')).toBeNull();
    expect(toRecordingSortUrl('status', 'asc')).toBeNull();
    expect(toRecordingSortUrl('startedAt', 'asc')).toBe('startedAt');
    expect(toRecordingSortUrl('durationSec', 'desc')).toBe('-durationSec');
  });

  it('nextRecordingSort: ở mặc định, "bỏ sắp xếp" của Table lật sang asc; nơi khác đi theo vòng của Table', () => {
    const atDefault = { key: 'startedAt', dir: 'desc' } as const;
    expect(nextRecordingSort(atDefault, null, null)).toBe('startedAt');
    expect(nextRecordingSort({ key: 'startedAt', dir: 'asc' }, 'startedAt', 'desc')).toBeNull();
    expect(nextRecordingSort(atDefault, 'fileSizeBytes', 'asc')).toBe('fileSizeBytes');
    expect(nextRecordingSort({ key: 'fileSizeBytes', dir: 'asc' }, 'fileSizeBytes', 'desc')).toBe(
      '-fileSizeBytes',
    );
    expect(nextRecordingSort({ key: 'fileSizeBytes', dir: 'desc' }, null, null)).toBeNull();
  });
});

describe('toRecordingListParams', () => {
  it('mặc định: chỉ page/limit/sort — không có khoá lọc thừa', () => {
    expect(toRecordingListParams(base)).toEqual({ page: 1, limit: 20, sort: '-startedAt' });
  });

  it('đủ bộ lọc → tham số BE; ngày → đầu/cuối ngày; sắp hết hạn = 7 ngày', () => {
    const p = toRecordingListParams({
      ...base,
      workspaceId: 'ws-1',
      status: 'FAILED,READY',
      from: '2026-10-01',
      to: '2026-10-31',
      sort: '-durationSec',
      expiring: true,
      includeDeleted: true,
    });
    expect(p).toEqual({
      page: 1,
      limit: 20,
      sort: '-durationSec',
      workspaceId: 'ws-1',
      status: 'READY,FAILED',
      from: new Date(2026, 9, 1, 0, 0, 0, 0).toISOString(),
      to: new Date(2026, 9, 31, 23, 59, 59, 999).toISOString(),
      expiringWithinDays: 7,
      includeDeleted: true,
    });
  });

  it('limit kẹp về 100 (BE trả 400 nếu vượt); ngày hỏng bị bỏ', () => {
    expect(toRecordingListParams({ ...base, limit: 5000 }).limit).toBe(100);
    const p = toRecordingListParams({ ...base, from: 'khong-phai-ngay', to: 'abc' });
    expect(p.from).toBeUndefined();
    expect(p.to).toBeUndefined();
  });
});

describe('formatRecordingDuration', () => {
  it.each([
    [null, '—'],
    [-5, '—'],
    [Number.NaN, '—'],
    [0, '0 giây'],
    [45, '45 giây'],
    [59.9, '59 giây'],
    [60, '1 phút'],
    [2520, '42 phút'],
    [3600, '1 giờ 00 phút'],
    [3900, '1 giờ 05 phút'],
    [4800, '1 giờ 20 phút'],
  ])('%s → %s', (input, expected) => {
    expect(formatRecordingDuration(input)).toBe(expected);
  });
});

describe('retentionLabel & storageDeltaText', () => {
  it('còn N ngày / hôm nay / quá hạn / chưa có hạn / đã xoá', () => {
    expect(retentionLabel({ deletedAt: null, retentionDaysLeft: 12 })).toBe('còn 12 ngày');
    expect(retentionLabel({ deletedAt: null, retentionDaysLeft: 0 })).toBe('hết hạn hôm nay');
    expect(retentionLabel({ deletedAt: null, retentionDaysLeft: -3 })).toBe('đã quá hạn 3 ngày');
    expect(retentionLabel({ deletedAt: null, retentionDaysLeft: null })).toBe('—');
    expect(retentionLabel({ deletedAt: '2026-10-01T00:00:00.000Z', retentionDaysLeft: 5 })).toBe(
      'Đã xoá',
    );
  });

  it('so 30 ngày trước: tăng/giảm/không đổi', () => {
    const GB = 1024 ** 3;
    expect(storageDeltaText(5 * GB, 4 * GB, formatFileSize)).toBe('Tăng 1 GB so với 30 ngày trước');
    expect(storageDeltaText(3 * GB, 4 * GB, formatFileSize)).toBe('Giảm 1 GB so với 30 ngày trước');
    expect(storageDeltaText(4 * GB, 4 * GB, formatFileSize)).toBe('Không đổi so với 30 ngày trước');
  });
});

describe('luật nút Xoá', () => {
  it.each([
    ['STARTING', false],
    ['RECORDING', false],
    ['STOPPING', false],
    ['PROCESSING', true],
    ['READY', true],
    ['FAILED', true],
  ] as const)('%s → xoá được: %s', (status, ok) => {
    expect(canDeleteRecording({ status, deletedAt: null })).toBe(ok);
    expect(deleteBlockedReason({ status, deletedAt: null })).toBe(
      ok ? null : 'Bản ghi đang được ghi hoặc đang dừng, chưa thể xoá.',
    );
  });

  it('đã xoá → không xoá lại', () => {
    expect(canDeleteRecording({ status: 'READY', deletedAt: '2026-10-01T00:00:00.000Z' })).toBe(
      false,
    );
    expect(deleteBlockedReason({ status: 'READY', deletedAt: '2026-10-01T00:00:00.000Z' })).toBe(
      'Bản ghi đã bị xoá.',
    );
  });
});

describe('objectStatusOf', () => {
  const rec = (over: Partial<Pick<AdminRecordingDetail, 'status' | 'deletedAt' | 'object'>>) => ({
    status: 'READY' as const,
    deletedAt: null,
    object: { exists: true, sizeBytes: 1024 },
    ...over,
  });
  it('có tệp / thiếu tệp / không kiểm được / đang ghi / đã xoá', () => {
    expect(objectStatusOf(rec({}), formatFileSize)).toEqual({
      label: 'Có tệp trên kho lưu trữ (1 KB)',
      tone: 'success',
    });
    expect(
      objectStatusOf(rec({ object: { exists: true, sizeBytes: null } }), formatFileSize),
    ).toEqual({ label: 'Có tệp trên kho lưu trữ', tone: 'success' });
    expect(
      objectStatusOf(rec({ object: { exists: false, sizeBytes: null } }), formatFileSize).tone,
    ).toBe('error');
    expect(objectStatusOf(rec({ object: null }), formatFileSize)).toEqual({
      label: 'Chưa kiểm tra được kho lưu trữ lúc này',
      tone: 'neutral',
    });
    expect(objectStatusOf(rec({ status: 'RECORDING', object: null }), formatFileSize).label).toBe(
      'Chưa có tệp (đang ghi)',
    );
    expect(
      objectStatusOf(rec({ deletedAt: '2026-10-01T00:00:00.000Z', object: null }), formatFileSize)
        .label,
    ).toBe('Đã xoá khỏi lưu trữ');
  });
});

describe('statusBadge("recording")', () => {
  it('mỗi trạng thái có nhãn CHỮ tiếng Việt và sắc riêng; lỗi là đỏ, sẵn sàng là xanh', () => {
    expect(statusBadge('recording', 'STARTING')).toEqual({
      variant: 'info',
      label: 'Đang bắt đầu',
    });
    expect(statusBadge('recording', 'RECORDING')).toEqual({
      variant: 'warning',
      label: 'Đang ghi',
    });
    expect(statusBadge('recording', 'STOPPING')).toEqual({
      variant: 'warning',
      label: 'Đang dừng',
    });
    expect(statusBadge('recording', 'PROCESSING')).toEqual({
      variant: 'info',
      label: 'Đang xử lý',
    });
    expect(statusBadge('recording', 'READY')).toEqual({ variant: 'success', label: 'Sẵn sàng' });
    expect(statusBadge('recording', 'FAILED')).toEqual({ variant: 'error', label: 'Lỗi' });
    // giá trị BE thêm sau này chưa khai → nhãn chính nó, sắc trung tính (không đoán màu)
    expect(statusBadge('recording', 'ARCHIVED')).toEqual({ variant: 'neutral', label: 'ARCHIVED' });
  });
});
