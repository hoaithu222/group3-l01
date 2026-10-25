import { useQuery } from '@tanstack/react-query';

import { resourcesService, type ResourceDto } from '../api';
import { resourceKeys } from '../queries/resources.keys';

/**
 * Nội dung chữ của tệp CODE/TEXT.
 *
 * ⛔ CHỈ tải khi `size ≤ maxBytes` (`codePreviewMaxBytes`, 512 KiB): kiểm TRƯỚC
 * khi gọi để không kéo cả tệp lớn về chỉ để từ chối — quá giới hạn thì
 * `CodePreview` hiện "Tệp quá lớn" + "Tải về" và query này không chạy.
 *
 * Xin URL ký NGAY trong `queryFn` (hết hạn 60 s nên không dùng lại URL cũ). Khoá
 * theo `version`: sửa tệp = nội dung khác. `gcTime` ngắn vì nội dung tệp nội bộ
 * không nên nằm lâu trong bộ nhớ.
 */
export function useResourceText(
  resource: Pick<ResourceDto, 'id' | 'size' | 'version'> | undefined,
  maxBytes: number,
  enabled = true,
) {
  return useQuery({
    queryKey: resourceKeys.text(resource?.id ?? '', resource?.version ?? 0),
    queryFn: async () => {
      const { url } = await resourcesService.url((resource as { id: string }).id, 'original');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Không tải được nội dung (HTTP ${response.status})`);
      return response.text();
    },
    enabled: Boolean(resource) && enabled && (resource?.size ?? Infinity) <= maxBytes,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: 1,
  });
}
