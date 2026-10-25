import { DEFAULT_RESOURCE_LIMITS } from '../constants/resource-limits.constants';
import { buildBreadcrumb } from '../utils/breadcrumb';
import { DEFAULT_PREFS, parsePrefs, prefsStorageKey, sortLabelOf } from '../utils/explorer-prefs';
import { formatSize, usagePercent } from '../utils/format-size';
import { safeFileName } from '../utils/resource-files';
import { resolveResourceLimits } from '../utils/resource-limits';
import { describeStorageUsage } from '../utils/storage-usage';
import { trashDaysLabel, trashDaysLeft } from '../utils/trash';
import { makeFolder } from './fixtures';

describe('formatSize / usagePercent', () => {
  it('dấu phẩy thập phân, bậc 1024, không hiện ",0"', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1536)).toBe('1,5 KB');
    expect(formatSize(1024 * 1024)).toBe('1 MB');
    expect(formatSize(20 * 1024 * 1024)).toBe('20 MB');
    expect(formatSize(2 * 1024 ** 3)).toBe('2 GB');
  });

  it('giá trị không hợp lệ ⇒ "—", không NaN', () => {
    expect(formatSize(null)).toBe('—');
    expect(formatSize(-1)).toBe('—');
    expect(formatSize(Number.NaN)).toBe('—');
  });

  it('usagePercent kẹp 0..100 và không chia cho 0', () => {
    expect(usagePercent(50, 100)).toBe(50);
    expect(usagePercent(500, 100)).toBe(100);
    expect(usagePercent(10, 0)).toBe(0);
  });
});

describe('describeStorageUsage (banner ≥ 90 %)', () => {
  it('dưới 90 % ⇒ ok; từ 90 % ⇒ warn; đủ 100 % ⇒ full', () => {
    expect(describeStorageUsage(89, 100).level).toBe('ok');
    expect(describeStorageUsage(90, 100).level).toBe('warn');
    expect(describeStorageUsage(99, 100).level).toBe('warn');
    expect(describeStorageUsage(100, 100).level).toBe('full');
    expect(describeStorageUsage(120, 100).remainingBytes).toBe(0);
  });
});

describe('thùng rác — số ngày còn lại', () => {
  const now = Date.parse('2026-09-20T00:00:00.000Z');

  it('làm tròn lên và không bao giờ âm', () => {
    // `purgeAt` do BE trả — client không tự cộng số ngày giữ.
    expect(trashDaysLeft('2026-10-10T00:00:00.000Z', now)).toBe(20);
    expect(trashDaysLeft('2026-10-19T12:00:00.000Z', now)).toBe(30);
    expect(trashDaysLeft('2026-09-01T00:00:00.000Z', now)).toBe(0);
  });

  it('thiếu/hỏng ngày ⇒ null, nhãn rỗng', () => {
    expect(trashDaysLeft(undefined, now)).toBeNull();
    expect(trashDaysLeft('xyz', now)).toBeNull();
    expect(trashDaysLabel(null)).toBe('');
    expect(trashDaysLabel(5)).toBe('Còn 5 ngày');
    expect(trashDaysLabel(0)).toBe('Sắp bị xoá vĩnh viễn');
  });
});

describe('resolveResourceLimits', () => {
  it('thiếu nhóm resource ⇒ toàn bộ mặc định, không ném lỗi', () => {
    expect(resolveResourceLimits(undefined)).toEqual(DEFAULT_RESOURCE_LIMITS);
    expect(resolveResourceLimits({ upload: {} })).toEqual(DEFAULT_RESOURCE_LIMITS);
  });

  it('đọc từng trường hợp lệ, trường sai kiểu rơi về mặc định', () => {
    const limits = resolveResourceLimits({
      resource: { codePreviewMaxBytes: 1000, folderDepthMax: 'tám', trashRetentionDays: -1 },
    });
    expect(limits.codePreviewMaxBytes).toBe(1000);
    expect(limits.folderDepthMax).toBe(DEFAULT_RESOURCE_LIMITS.folderDepthMax);
    expect(limits.trashRetentionDays).toBe(DEFAULT_RESOURCE_LIMITS.trashRetentionDays);
  });
});

describe('tuỳ chọn hiển thị đã lưu', () => {
  it('dữ liệu hỏng/lạ ⇒ mặc định từng trường', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ sort: 'x', order: 'y', view: 'z' })).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ sort: 'name', order: 'asc', view: 'list' })).toEqual({
      order: 'asc',
      sort: 'name',
      view: 'list',
    });
  });

  it('khoá lưu theo người dùng và nhãn sắp xếp đọc được', () => {
    expect(prefsStorageKey('u1')).toBe('resources:view:u1');
    expect(sortLabelOf({ order: 'desc', sort: 'size' })).toBe('Lớn nhất');
  });
});

describe('buildBreadcrumb', () => {
  it('gốc luôn đứng đầu; không lặp thư mục hiện tại dù BE có/không đưa nó vào breadcrumb', () => {
    const a = makeFolder({ id: 'a', name: 'A' });
    const b = makeFolder({ id: 'b', name: 'B', parentId: 'a', depth: 2 });

    const withoutSelf = buildBreadcrumb({ breadcrumb: [a], children: [], folder: b });
    const withSelf = buildBreadcrumb({ breadcrumb: [a, b], children: [], folder: b });

    expect(withoutSelf.map((s) => s.id)).toEqual(['root', 'a', 'b']);
    expect(withSelf.map((s) => s.id)).toEqual(['root', 'a', 'b']);
    expect(buildBreadcrumb(undefined)).toEqual([{ id: 'root', label: 'Tài liệu' }]);
  });
});

describe('safeFileName', () => {
  it('thay ký tự cấm, giữ đuôi khi cắt, không rỗng', () => {
    expect(safeFileName('a/b:c*d?.pdf')).toBe('a_b_c_d_.pdf');
    expect(safeFileName('   ')).toBe('tep');
    expect(safeFileName(`${'x'.repeat(200)}.pdf`).endsWith('.pdf')).toBe(true);
    expect(safeFileName('../../etc').startsWith('.')).toBe(false);
  });
});
