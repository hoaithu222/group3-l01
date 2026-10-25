import type { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import { docsCollabService } from '../api/docs-collab.service';
import { ASSET_URL_CACHE_MS } from '../constants/docs.constants';
import { docsKeys } from '../queries/docs.keys';
import type { HostMessage } from './doc-editor-bridge.types';

export type AssetUrlReply = Extract<HostMessage, { type: 'assetUrl' }>['payload'];

/**
 * Đáp `resolveAssetUrl` của WebView: URL ký của ảnh (`GET /assets/:id/url`), đệm 50 s trong React Query (URL sống ≤ 60 s — cache lâu hơn là
 * đưa cho WebView một URL đã hết hạn, ảnh vỡ mà không ai hay). Nội dung Yjs chỉ lưu `assetId`; WebView không bao giờ thấy URL cố định (CW-D7).
 * Lỗi KHÔNG ném: đổi thành `error` để editor hiện khung "không tải được ảnh" thay vì đợi mãi — 404 → `not-found`, 403 → `forbidden`, còn lại `failed`.
 */
export async function resolveAssetUrlReply(
  queryClient: QueryClient,
  assetId: string,
): Promise<AssetUrlReply> {
  try {
    const result = await queryClient.fetchQuery({
      queryFn: () => docsCollabService.assetUrl(assetId),
      queryKey: docsKeys.assetUrl(assetId),
      staleTime: ASSET_URL_CACHE_MS,
    });
    const expiresAt = Date.parse(result.expiresAt);
    return { assetId, url: result.url, ...(Number.isNaN(expiresAt) ? {} : { expiresAt }) };
  } catch (error) {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === 404) return { assetId, error: 'not-found' };
    if (status === 403) return { assetId, error: 'forbidden' };
    return { assetId, error: 'failed' };
  }
}
