import { JoinPendingScreen } from '@/features/workspaces/screens/JoinPendingScreen';

/**
 * Màn "Đang chờ duyệt" (p3-04) — `?wsId=…`.
 *
 * ⚠️ Cố ý KHÔNG nằm trong `[wsId]/` như app.md ghi (`[wsId]/pending`): `[wsId]/_layout.tsx`
 * gọi `useWorkspaceScope(wsId, { redirectWhenGone: true })`, mà người đang CHỜ DUYỆT
 * không phải thành viên nên `GET /workspaces/:id` trả 404 trung tính → layout đá họ
 * về `/workspaces` ngay khi màn vừa mở. Cùng cấp với `new.tsx` thì layout đó không bọc.
 */
export default function JoinPendingRoute() {
  return <JoinPendingScreen />;
}
