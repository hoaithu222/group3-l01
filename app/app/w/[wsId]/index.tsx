import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * app.md p1-01 §6 — `superapp://w/{wsId}` và `https://<domain>/w/{wsId}` mở thẳng
 * tổng quan nhóm. Đường dẫn NGẮN, ngoài nhóm `(app)` (cùng mẫu `app/m/[id].tsx`
 * và `app/invite/[code].tsx`) — chỉ chuyển tiếp sang route thật; hàng rào đăng
 * nhập của `(app)/_layout.tsx` vẫn áp dụng vì route đích nằm trong nhóm đó, và
 * `[wsId]/_layout.tsx` đưa người không phải thành viên về `/workspaces`.
 *
 * ⚠️ Chưa đăng nhập thì đích bị mất sau khi đăng nhập (chỉ `pendingInvite` được
 * lưu qua đăng nhập, xem `members/store/pending-invite.ts`) — người dùng về trang
 * chủ và mở lại link. Chấp nhận được cho link nhóm; link MỜI mới là link phải sống
 * sót qua đăng ký.
 *
 * ⚠️ Không đổi ý nghĩa `/m/<id>` (hội thoại): mã họp `/m/<code>` của p0-12/p2-04
 * sẽ giải xung đột đó sau, không phải ở đây.
 */
export default function ShortWorkspaceLinkRoute() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  return <Redirect href={{ pathname: '/workspaces/[wsId]', params: { wsId } }} />;
}
