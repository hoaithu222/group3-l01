import type { InfiniteData } from '@tanstack/react-query';

import type { ResourcePage } from '../api';
import { buildExplorerItems, flattenPages, sortFolders } from '../utils/explorer-items';
import {
  listAcceptsNewResource,
  prependResource,
  removeResourceFromPages,
  replaceResourceInPages,
} from '../utils/resource-pages';
import { buildTrashEntries } from '../utils/trash-entries';
import { makeFolder, makeResource } from './fixtures';

function pages(
  ...lists: ReturnType<typeof makeResource>[][]
): InfiniteData<ResourcePage, string | undefined> {
  return {
    pageParams: lists.map(() => undefined),
    pages: lists.map((items) => ({ items, meta: { hasMore: false, limit: 30, nextCursor: null } })),
  };
}

describe('buildExplorerItems — thư mục trước, tệp sau', () => {
  it('thư mục luôn đứng trước dù tệp mới hơn', () => {
    const items = buildExplorerItems({
      folders: [makeFolder({ id: 'f2', name: 'Zebra' }), makeFolder({ id: 'f1', name: 'Đề thi' })],
      order: 'asc',
      resources: [makeResource({ id: 'r1' })],
      sort: 'name',
    });
    expect(items.map((item) => item.key)).toEqual(['f:f1', 'f:f2', 'r:r1']);
  });

  it('sắp tên bỏ dấu: "Đề" đứng theo chữ d, không nhảy về cuối', () => {
    const sorted = sortFolders(
      [
        makeFolder({ id: '1', name: 'Đề' }),
        makeFolder({ id: '2', name: 'Cờ' }),
        makeFolder({ id: '3', name: 'Em' }),
      ],
      'name',
      'asc',
    );
    expect(sorted.map((f) => f.name)).toEqual(['Cờ', 'Đề', 'Em']);
  });

  it('flattenPages bỏ trùng id khi tệp mới chồng lên trang cũ', () => {
    const a = makeResource({ id: 'a' });
    const merged = flattenPages([{ items: [a, makeResource({ id: 'b' })] }, { items: [a] }]);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('biến đổi trang cache', () => {
  it('prepend chèn đầu trang đầu và không chèn hai lần', () => {
    const data = pages([makeResource({ id: 'a' })]);
    const created = makeResource({ id: 'new' });
    const once = prependResource(data, created);
    expect(once?.pages[0]?.items.map((r) => r.id)).toEqual(['new', 'a']);
    expect(prependResource(once, created)).toBe(once);
  });

  it('gỡ và thay tại chỗ', () => {
    const data = pages([makeResource({ id: 'a' }), makeResource({ id: 'b' })]);
    expect(removeResourceFromPages(data, 'a')?.pages[0]?.items.map((r) => r.id)).toEqual(['b']);
    const renamed = makeResource({ id: 'b', name: 'Mới' });
    expect(replaceResourceInPages(data, renamed)?.pages[0]?.items[1]?.name).toBe('Mới');
  });

  it('chỉ chèn thẳng khi danh sách "mới nhất trước" đúng thư mục và loại', () => {
    const file = makeResource({ folderId: 'f1', type: 'PDF' });
    const base = { order: 'desc' as const, sort: 'createdAt' as const };
    expect(listAcceptsNewResource({ ...base, folderId: 'f1' }, file)).toBe(true);
    expect(listAcceptsNewResource({ ...base, folderId: 'root' }, file)).toBe(false);
    expect(listAcceptsNewResource({ ...base, folderId: 'f1', type: 'IMAGE' }, file)).toBe(false);
    expect(listAcceptsNewResource({ ...base, folderId: 'f1', q: 'abc' }, file)).toBe(false);
    expect(listAcceptsNewResource({ folderId: 'f1', order: 'asc', sort: 'name' }, file)).toBe(
      false,
    );
    expect(listAcceptsNewResource({ ...base }, makeResource({ folderId: null }))).toBe(true);
  });
});

describe('buildTrashEntries', () => {
  it('thư mục trước, mới xoá lên đầu, tính số ngày còn lại', () => {
    const now = Date.parse('2026-09-20T00:00:00.000Z');
    // `purgeAt` + `canRestore`/`canPurge` do BE tính — client chỉ đọc.
    const trashMeta = (deletedAt: string, purgeAt: string) => ({
      canPurge: true,
      canRestore: true,
      deletedAt,
      purgeAt,
    });
    const entries = buildTrashEntries(
      [
        {
          folders: [
            {
              ...makeFolder({ id: 'f' }),
              ...trashMeta('2026-09-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
            },
          ],
          resources: [
            {
              ...makeResource({ id: 'old' }),
              ...trashMeta('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
            },
            {
              ...makeResource({ id: 'new' }),
              ...trashMeta('2026-09-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z'),
            },
          ],
        },
      ],
      now,
    );
    expect(entries.map((e) => e.key)).toEqual(['f:f', 'r:new', 'r:old']);
    expect(entries[1]?.daysLabel).toBe('Còn 28 ngày');
    expect(entries[1]).toMatchObject({ canPurge: true, canRestore: true });
  });
});
