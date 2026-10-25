import type { InfiniteData } from '@tanstack/react-query';

import type { ResourcePage } from '../api';
import {
  insertCreatedResource,
  removeResourceFromLists,
  restoreListSnapshot,
} from '../queries/resource-cache';
import { resourceKeys } from '../queries/resources.keys';
import { makeResource } from './fixtures';
import { makeQueryClient } from './render-helpers';

/** Cache danh sách tệp: chèn tệp mới đúng chỗ, gỡ/hoàn tác ở cả danh sách duyệt lẫn kết quả tìm. */

type Data = InfiniteData<ResourcePage, string | undefined>;

function pages(...ids: string[]): Data {
  return {
    pageParams: [undefined],
    pages: [
      {
        items: ids.map((id) => makeResource({ folderId: null, id })),
        meta: { hasMore: false, limit: 30, nextCursor: null },
      },
    ],
  };
}

const idsOf = (data: Data | undefined) => data?.pages[0]?.items.map((item) => item.id);

describe('khoá kết quả tìm', () => {
  it('sort/order nằm trong khoá — đổi sắp xếp khi đang tìm không dùng nhầm cache cũ', () => {
    const byDate = resourceKeys.search('ws', 'abc', undefined, 'createdAt', 'desc');
    const byName = resourceKeys.search('ws', 'abc', undefined, 'name', 'asc');
    expect(byDate).not.toEqual(byName);
  });
});

describe('insertCreatedResource', () => {
  it('chèn đầu danh sách "mới nhất" đúng thư mục; danh sách khác + kết quả tìm chỉ đánh dấu cũ', () => {
    const client = makeQueryClient();
    const newest = resourceKeys.list('ws', { folderId: 'root', order: 'desc', sort: 'createdAt' });
    const byName = resourceKeys.list('ws', { folderId: 'root', order: 'asc', sort: 'name' });
    const search = resourceKeys.search('ws', 'abc', undefined, 'createdAt', 'desc');
    client.setQueryData(newest, pages('a'));
    client.setQueryData(byName, pages('a'));
    client.setQueryData(search, pages('a'));

    insertCreatedResource(client, 'ws', makeResource({ folderId: null, id: 'new' }));

    expect(idsOf(client.getQueryData(newest))).toEqual(['new', 'a']);
    expect(idsOf(client.getQueryData(byName))).toEqual(['a']);
    expect(client.getQueryState(byName)?.isInvalidated).toBe(true);
    expect(client.getQueryState(search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(newest)?.isInvalidated).toBe(false);
  });

  it('làm cũ hạn mức dung lượng (storage)', () => {
    const client = makeQueryClient();
    client.setQueryData(resourceKeys.storage('ws'), { byType: [], quotaBytes: 10, usedBytes: 1 });

    insertCreatedResource(client, 'ws', makeResource());

    expect(client.getQueryState(resourceKeys.storage('ws'))?.isInvalidated).toBe(true);
  });
});

describe('removeResourceFromLists / restoreListSnapshot (xoá optimistic + hoàn tác)', () => {
  it('gỡ khỏi cả danh sách duyệt lẫn kết quả tìm; lỗi thì trả lại đúng như cũ', () => {
    const client = makeQueryClient();
    const list = resourceKeys.list('ws', { folderId: 'root', order: 'desc', sort: 'createdAt' });
    const search = resourceKeys.search('ws', 'abc', undefined, 'createdAt', 'desc');
    client.setQueryData(list, pages('a', 'b'));
    client.setQueryData(search, pages('a'));

    const snapshot = removeResourceFromLists(client, 'ws', 'a');

    expect(idsOf(client.getQueryData(list))).toEqual(['b']);
    expect(idsOf(client.getQueryData(search))).toEqual([]);

    restoreListSnapshot(client, snapshot);

    expect(idsOf(client.getQueryData(list))).toEqual(['a', 'b']);
    expect(idsOf(client.getQueryData(search))).toEqual(['a']);
  });

  it('không đụng danh sách của workspace khác', () => {
    const client = makeQueryClient();
    const other = resourceKeys.list('ws-2', { folderId: 'root', order: 'desc', sort: 'createdAt' });
    client.setQueryData(other, pages('a'));

    removeResourceFromLists(client, 'ws', 'a');

    expect(idsOf(client.getQueryData(other))).toEqual(['a']);
  });
});
