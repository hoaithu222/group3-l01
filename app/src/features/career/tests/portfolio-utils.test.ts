import { isoToMonthDate, monthLabel, monthToIso } from '../utils/portfolio-period';
import {
  canPublish,
  hasPublishBar,
  publishChecklist,
  publishSummary,
} from '../utils/portfolio-publish-check';
import {
  DEFAULT_SECTIONS,
  moveSection,
  sectionsEqual,
  toggleSection,
} from '../utils/portfolio-sections';
import { snapshotStats } from '../utils/portfolio-text';
import { trialFromParams } from '../utils/portfolio-url';
import { makePortfolio, makeSnapshot } from './portfolio.fixtures';

describe('sections (bật/tắt + lên/xuống, không kéo thả)', () => {
  it('moveSection đổi chỗ một bậc và đánh lại `order` 0..3; ra ngoài biên giữ nguyên', () => {
    const down = moveSection(DEFAULT_SECTIONS, 'ABOUT', 1);
    expect(down.map((s) => [s.kind, s.order])).toEqual([
      ['PROJECTS', 0],
      ['ABOUT', 1],
      ['SKILLS', 2],
      ['CONTACT', 3],
    ]);
    expect(moveSection(DEFAULT_SECTIONS, 'ABOUT', -1).map((s) => s.kind)).toEqual([
      'ABOUT',
      'PROJECTS',
      'SKILLS',
      'CONTACT',
    ]);
    expect(moveSection(down, 'CONTACT', 1).map((s) => s.kind)).toEqual([
      'PROJECTS',
      'ABOUT',
      'SKILLS',
      'CONTACT',
    ]);
  });

  it('luôn đủ bốn mục đúng một lần (BE bắt length 4, mỗi loại một lần)', () => {
    const moved = toggleSection(moveSection(DEFAULT_SECTIONS, 'SKILLS', -1), 'CONTACT', false);
    expect(new Set(moved.map((s) => s.kind)).size).toBe(4);
    expect(moved.find((s) => s.kind === 'CONTACT')?.visible).toBe(false);
  });

  it('sectionsEqual so bật/tắt và thứ tự, không so `order` thô', () => {
    expect(
      sectionsEqual(
        DEFAULT_SECTIONS,
        DEFAULT_SECTIONS.map((s) => ({ ...s })),
      ),
    ).toBe(true);
    expect(sectionsEqual(DEFAULT_SECTIONS, toggleSection(DEFAULT_SECTIONS, 'ABOUT', false))).toBe(
      false,
    );
    expect(sectionsEqual(DEFAULT_SECTIONS, moveSection(DEFAULT_SECTIONS, 'ABOUT', 1))).toBe(false);
  });
});

describe('thời gian dự án theo THÁNG, múi giờ Việt Nam (BE in MM/yyyy theo Asia/Ho_Chi_Minh)', () => {
  it('monthToIso → đầu tháng +07:00; đọc ngược đúng tháng dù server trả dạng Z', () => {
    expect(monthToIso(new Date(2026, 8, 17))).toBe('2026-09-01T00:00:00+07:00');
    // 2026-09-01 00:00 giờ VN = 2026-08-31 17:00Z — dạng server hay trả; dùng giờ máy của người ở phía tây UTC sẽ ra "08/2026".
    expect(monthLabel('2026-08-31T17:00:00.000Z')).toBe('09/2026');
    expect(isoToMonthDate('2026-09-01T00:00:00+07:00')).toEqual(new Date(2026, 8, 1));
    expect(monthLabel(monthToIso(new Date(2026, 0, 31)))).toBe('01/2026');
  });

  it('trống/không hợp lệ ⇒ null', () => {
    expect(isoToMonthDate(null)).toBeNull();
    expect(isoToMonthDate('không phải ngày')).toBeNull();
    expect(monthLabel(null)).toBe('');
  });
});

describe('checklist công khai (PublishSheet)', () => {
  it('thiếu dự án đang hiện ⇒ CHẶN; chưa xem trước chỉ là khuyến nghị', () => {
    const none = publishChecklist({ displayName: 'An', previewed: false, visibleProjects: 0 });
    expect(canPublish(none)).toBe(false);
    const ok = publishChecklist({ displayName: 'An', previewed: false, visibleProjects: 2 });
    expect(canPublish(ok)).toBe(true);
    expect(ok.find((item) => item.key === 'preview')).toMatchObject({ blocking: false, ok: false });
    expect(
      canPublish(publishChecklist({ displayName: ' ', previewed: true, visibleProjects: 1 })),
    ).toBe(false);
  });

  it('tóm tắt đúng thứ sẽ lên trang; thanh Công khai chỉ khi có hồ sơ chưa bị gỡ', () => {
    expect(publishSummary({ badges: 4, hasBio: true, links: 2, visibleProjects: 3 })).toBe(
      'Sẽ công khai: số liệu 3 dự án, 4 huy hiệu, giới thiệu, 2 liên kết.',
    );
    expect(publishSummary({ badges: 0, hasBio: false, links: 0, visibleProjects: 0 })).toBe(
      'Chưa có nội dung nào để công khai.',
    );
    expect(hasPublishBar(null)).toBe(false);
    expect(hasPublishBar(makePortfolio({ takenDown: true }))).toBe(false);
    expect(hasPublishBar(makePortfolio())).toBe(true);
  });
});

describe('số liệu dự án (SnapshotStatsGrid): luôn kèm ĐƠN VỊ, ẩn dòng chưa có dữ liệu', () => {
  it('đủ dữ liệu ⇒ "62 điểm", "90% đúng hạn", "8,2/10 điểm review"', () => {
    const values = snapshotStats(
      makeSnapshot({ contributionPct: 72.5, contributionSharePct: 31 }),
    ).map((line) => line.value);
    expect(values).toEqual([
      '40 task',
      '62 điểm',
      '90% đúng hạn',
      '72,5/100 điểm',
      '31% khối lượng của nhóm',
      '8,2/10 điểm review',
      '5 tệp',
      '3 người',
    ]);
  });

  it('null (p4-06 chưa có / tắt showContribution) ⇒ không có dòng, không bày "—"', () => {
    const keys = snapshotStats(makeSnapshot({ onTimeRatePct: null, peerReviewAvg: null })).map(
      (line) => line.key,
    );
    expect(keys).toEqual(['tasks', 'points', 'files', 'team']);
  });
});

describe('tham số thử mẫu của màn xem trước', () => {
  it('cần đủ CẢ template và accent hợp lệ, thiếu/sai một là bỏ (BE cần cả hai)', () => {
    expect(trialFromParams({ accent: 'BLUE', template: 'DEVELOPER' })).toEqual({
      accent: 'BLUE',
      template: 'DEVELOPER',
    });
    expect(trialFromParams({ template: 'DEVELOPER' })).toBeUndefined();
    expect(trialFromParams({ accent: 'PINK', template: 'DEVELOPER' })).toBeUndefined();
  });
});
