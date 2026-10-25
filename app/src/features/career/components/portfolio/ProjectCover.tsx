import { View } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail } from '@/shared/ui/card';

/**
 * Ảnh bìa NHỎ (64dp, vuông) của một dự án ở danh sách Tổng quan — dự án có `coverAssetId` thì hiện ảnh thật thay vì chỉ có chữ.
 *
 * ── Vì sao là component riêng ────────────────────────────────────────────────
 * `useAssetUrl` là một truy vấn (URL ký sống ~60 s, `gcTime` 60 s). Tách ra để NƠI GỌI chỉ gắn nó khi dự án THẬT SỰ có ảnh bìa
 * (`{project.coverAssetId ? <ProjectCover/> : …}`) — dự án không ảnh không sinh truy vấn nào, và danh sách không phải gọi hook theo điều kiện.
 *
 * `cachePolicy="none"`: URL ký đổi mỗi lần lấy nên cache đĩa vô ích và để lại ảnh riêng tư trên máy (xem `Thumbnail`). URL hết hạn/lỗi
 * tải ⇒ `Thumbnail` tự rơi về ô giữ chỗ. Ảnh trang trí (tên dự án nằm ngay cạnh) nên không có `alt`.
 */
export function ProjectCover({ assetId }: { assetId: string }) {
  const url = useAssetUrl(assetId, 'THUMB').data?.url;

  return (
    <View className="w-16">
      <Thumbnail
        aspect="square"
        cachePolicy="none"
        className="rounded-xs"
        source={url ? { uri: url } : undefined}
      />
    </View>
  );
}
