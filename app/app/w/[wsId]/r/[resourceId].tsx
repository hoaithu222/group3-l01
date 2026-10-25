import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * app.md p3-01 §1 — `https://<domain>/w/{wsId}/r/{resourceId}` mở thẳng khung xem
 * trước một tệp. Chỉ chuyển tiếp, cùng mẫu `app/w/[wsId]/c/[chId].tsx`: hàng rào
 * đăng nhập của `(app)/_layout.tsx` vẫn áp dụng, còn 404 (không phải thành viên/tệp
 * không còn) do `ResourcePreviewScreen` hiện màn trung tính. Đường dẫn `/w/` đã có
 * trong `intentFilters` của `app.config.ts` (p1-01) nên không cần khai thêm.
 */
export default function ShortResourceLinkRoute() {
  const { wsId, resourceId } = useLocalSearchParams<{ wsId: string; resourceId: string }>();
  return (
    <Redirect
      href={{
        pathname: '/workspaces/[wsId]/resources/preview/[resourceId]',
        params: { wsId, resourceId },
      }}
    />
  );
}
