import type { PortfolioBuildUpdatedEvent } from '../api/portfolio.types';
import {
  isBuildInFlight,
  markDirty,
  mergeBuildEvent,
  movedIds,
  removeProject,
  reorderProjects,
  upsertProject,
} from '../utils/portfolio-cache';
import { makeBuild, makeOverview, makePortfolio, makeProject } from './portfolio.fixtures';

/** app.md p6-07 §4: hàm thuần vá cache `['career','portfolio']` — sai một chỗ là danh sách/nút Công khai hiện sai mà không lỗi nào báo. */
const projects = [
  makeProject({ id: 'a', order: 0 }),
  makeProject({ id: 'b', order: 1, workspaceId: 'ws-2' }),
  makeProject({ id: 'c', order: 2, workspaceId: 'ws-3' }),
];

describe('sắp xếp dự án', () => {
  it('movedIds đổi chỗ MỘT bậc; ra ngoài biên giữ nguyên thứ tự', () => {
    expect(movedIds(projects, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedIds(projects, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedIds(projects, 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(movedIds(projects, 'c', 1)).toEqual(['a', 'b', 'c']);
  });

  it('reorderProjects gán `order` = chỉ số mới, không đụng phần còn lại; chưa tải (undefined) đi qua nguyên vẹn', () => {
    const next = reorderProjects(makeOverview({ projects }), ['c', 'a', 'b']);
    expect(next?.projects.map((p) => [p.id, p.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect(reorderProjects(undefined, ['a'])).toBeUndefined();
  });

  it('upsert thay theo id (giữ thứ tự), thêm mới xếp cuối; remove gỡ đúng một dự án', () => {
    const base = makeOverview({ projects });
    const replaced = upsertProject(base, { ...projects[1]!, title: 'Mới' });
    expect(replaced?.projects.map((p) => p.title)).toEqual([
      projects[0]!.title,
      'Mới',
      projects[2]!.title,
    ]);
    const added = upsertProject(base, makeProject({ id: 'd', order: 3 }));
    expect(added?.projects.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(removeProject(base, 'b')?.projects.map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('markDirty', () => {
  it('chỉ đánh dấu "có thay đổi chưa cập nhật" khi ĐANG PUBLISHED', () => {
    const published = makeOverview({ portfolio: makePortfolio({ status: 'PUBLISHED' }) });
    expect(markDirty(published)?.portfolio?.hasUnpublishedChanges).toBe(true);
    const draft = makeOverview();
    expect(markDirty(draft)).toBe(draft);
    expect(markDirty(makeOverview({ portfolio: null }))?.portfolio).toBeNull();
  });
});

describe('mergeBuildEvent', () => {
  const NOW = '2026-09-27T01:00:00.000Z';
  const event = (over: Partial<PortfolioBuildUpdatedEvent>): PortfolioBuildUpdatedEvent => ({
    buildId: 'bd-1',
    buildVersion: 1,
    portfolioId: 'pf-1',
    status: 'BUILDING',
    v: 1,
    ...over,
  });

  it('cùng buildId ⇒ đè trạng thái, giữ trigger/portfolioVersion; READY ghi `finishedAt`, xoá lỗi cũ', () => {
    const merged = mergeBuildEvent(
      makeBuild({ status: 'QUEUED' }),
      event({ status: 'READY' }),
      NOW,
    );
    expect(merged).toMatchObject({
      error: null,
      finishedAt: NOW,
      id: 'bd-1',
      portfolioVersion: 3,
      status: 'READY',
    });
  });

  it('FAILED mang câu lỗi tiếng Việt của BE; thiếu thì dùng câu mặc định', () => {
    expect(
      mergeBuildEvent(
        makeBuild(),
        event({ error: 'Quá thời gian tạo trang', status: 'FAILED' }),
        NOW,
      ).error,
    ).toBe('Quá thời gian tạo trang');
    expect(mergeBuildEvent(makeBuild(), event({ status: 'FAILED' }), NOW).error).toContain(
      'Không tạo được trang',
    );
  });

  it('build KHÁC id (server tự xếp khi thu hồi huy hiệu) ⇒ dựng bản tối thiểu, không đè build cũ', () => {
    const merged = mergeBuildEvent(
      makeBuild({ id: 'old', status: 'READY' }),
      event({ buildId: 'new', buildVersion: 2 }),
      NOW,
    );
    expect(merged).toMatchObject({ buildVersion: 2, id: 'new', status: 'BUILDING' });
  });

  it('isBuildInFlight: QUEUED/BUILDING đang chạy, READY/FAILED/null thì không', () => {
    expect(
      ['QUEUED', 'BUILDING', 'READY', 'FAILED'].map((status) =>
        isBuildInFlight(makeBuild({ status: status as 'READY' })),
      ),
    ).toEqual([true, true, false, false]);
    expect(isBuildInFlight(null)).toBe(false);
  });
});
