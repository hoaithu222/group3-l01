import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Thumbnail, type MediaCardAspect } from '@/shared/ui/card';

export interface SubjectCoverProps {
  /** `subject.coverAssetId` — ảnh bìa admin tải lên cho môn. */
  assetId: string;
  aspect?: MediaCardAspect;
}

/**
 * Ảnh bìa của MỘT môn — dùng chung cho thẻ môn ở tab "Lộ trình" (`SubjectCard`) và đầu màn tổng quan môn (`SubjectHeader`),
 * để hai nơi xin URL và vẽ ô ảnh giống hệt nhau (trước đây thẻ môn tự viết bản riêng, màn tổng quan thì bỏ qua ảnh bìa).
 *
 * ⚠️ URL KÝ có hạn (`useAssetUrl`, sống ≤ 60 s) ⇒ `cachePolicy="none"`: mỗi lần xin là một chuỗi khác, cache đĩa vừa vô ích vừa
 * để lại ảnh trên máy. Chưa có URL/tải hỏng thì `Thumbnail` tự vẽ ô giữ chỗ đúng tỉ lệ — bố cục không nhảy khi ảnh về.
 * Ảnh là TRANG TRÍ (không `alt`): tên môn đã nằm ở chữ ngay cạnh (tiêu đề thẻ / thanh tiêu đề).
 */
export function SubjectCover({ aspect = 'banner-slim', assetId }: SubjectCoverProps) {
  const { data } = useAssetUrl(assetId);
  return (
    <Thumbnail aspect={aspect} cachePolicy="none" source={data ? { uri: data.url } : undefined} />
  );
}
