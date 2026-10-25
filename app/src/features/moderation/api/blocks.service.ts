import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { BLOCKS_API } from './blocks.api';
import type { BlockResult, BlocksPage } from './moderation.types';

/**
 * ⛔ `list` KHÔNG dùng `unwrapData`: BE trả `{ data: BlockedUser[], meta: { …, allIds } }` ngay
 * ở gốc thân — `unwrapData` bóc `.data` và VỨT `meta` (mất luôn `allIds`, thứ duy nhất nạp
 * `useBlockedIds`). Đọc thẳng `response.data`.
 *
 * `skipErrorToast`: `useBlockedSync` gọi nền ở mọi lần mở app (không đáng một toast khi mạng chập
 * chờn), còn chặn/bỏ chặn thì lỗi hiện TRONG `BlockConfirmSheet` (BLOCK_004 cần đọc kỹ).
 */
export const blocksService = {
  async list(cursor?: string, limit?: number): Promise<BlocksPage> {
    const response = await apiClient.get<BlocksPage>(BLOCKS_API.root, {
      params: { cursor, limit },
      skipErrorToast: true,
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  /** 201 (mới) hoặc 200 (đã chặn từ trước) — cả hai đều là thành công. */
  async block(userId: string): Promise<BlockResult> {
    const response = await apiClient.post<BlockResult>(BLOCKS_API.root, { userId }, { skipErrorToast: true });
    return unwrapData<BlockResult>(response);
  },

  /** Idempotent — chưa chặn vẫn 200, `data: null`. */
  async unblock(userId: string): Promise<void> {
    await apiClient.delete(BLOCKS_API.one(userId), { skipErrorToast: true });
  },
};
