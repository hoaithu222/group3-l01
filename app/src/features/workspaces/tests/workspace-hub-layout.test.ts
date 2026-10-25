import type { WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';
import { hubEntryA11yLabel, splitHubEntries } from '../utils/workspace-hub-layout';

/**
 * Chia lối vào của tổng quan nhóm thành Ô lưới / DÒNG danh sách: chỉ đổi CHỖ đặt, không bỏ mục nào, giữ thứ tự của hook;
 * dưới 2 ô thì không dựng lưới (một ô trơ trọi giữa thẻ).
 */
function entry(key: string): WorkspaceHubEntry {
  return {
    description: `Mô tả ${key}`,
    icon: 'service',
    key,
    label: key,
    onPress: jest.fn(),
    tone: 'brand',
  };
}

const keys = (entries: WorkspaceHubEntry[]) => entries.map((item) => item.key);

describe('splitHubEntries', () => {
  it('nơi mở hằng ngày lên lưới, công cụ quản trị xuống dòng — giữ nguyên thứ tự, không mất mục nào', () => {
    const all = [
      'channels',
      'members',
      'meetings',
      'wallet',
      'leaderboard',
      'integrations',
      'docs',
      'whiteboards',
      'mentor',
      'plagiarism',
    ].map(entry);

    const { rows, tiles } = splitHubEntries(all);

    expect(keys(tiles)).toEqual([
      'channels',
      'members',
      'meetings',
      'wallet',
      'leaderboard',
      'docs',
      'whiteboards',
    ]);
    expect(keys(rows)).toEqual(['integrations', 'mentor', 'plagiarism']);
  });

  it('chỉ MỘT mục thuộc lưới (khách chỉ có "Kênh") ⇒ không lưới, mọi mục thành dòng theo thứ tự cũ', () => {
    const { rows, tiles } = splitHubEntries([entry('channels'), entry('mentor')]);

    expect(tiles).toEqual([]);
    expect(keys(rows)).toEqual(['channels', 'mentor']);
  });

  it('không có công cụ nào ngoài lưới ⇒ danh sách dòng rỗng', () => {
    const { rows, tiles } = splitHubEntries([
      entry('channels'),
      entry('docs'),
      entry('whiteboards'),
    ]);

    expect(keys(tiles)).toEqual(['channels', 'docs', 'whiteboards']);
    expect(rows).toEqual([]);
  });
});

describe('hubEntryA11yLabel', () => {
  it('tên + mô tả, thêm số chưa đọc khi có; 0/undefined thì không nói "0 chưa đọc"', () => {
    expect(hubEntryA11yLabel({ badge: 5, description: 'Xem kênh', label: 'Kênh' })).toBe(
      'Kênh. Xem kênh, 5 chưa đọc',
    );
    expect(hubEntryA11yLabel({ badge: 0, description: 'Xem kênh', label: 'Kênh' })).toBe(
      'Kênh. Xem kênh',
    );
    expect(hubEntryA11yLabel({ description: '', label: 'Ví nhóm' })).toBe('Ví nhóm');
  });
});
