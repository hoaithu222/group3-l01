import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * p4-01 app.md §1 — `https://<domain>/s/{setId}` mở thẳng một bộ học. Chỉ chuyển tiếp, cùng mẫu `app/m/[id].tsx`;
 * hàng rào đăng nhập của `(app)/_layout.tsx` vẫn áp dụng, 404 do `SetOverviewScreen` hiện màn trung tính.
 * ⚠️ Intent filter Android cần `pathPrefix: '/s/'` trong `app.config.ts` (p0-12 sở hữu) — chưa thêm ở đây.
 */
export default function ShortStudySetLinkRoute() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return <Redirect href={{ params: { setId }, pathname: '/study/sets/[setId]' }} />;
}
