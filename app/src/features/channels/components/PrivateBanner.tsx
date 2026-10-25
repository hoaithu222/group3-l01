import { Alert } from '@/shared/ui/alert';

/** "Chỉ thành viên được cấp quyền mới xem được kênh này" (app.md §2, §3 — kênh PRIVATE). */
export function PrivateBanner() {
  return <Alert description="Chỉ thành viên được cấp quyền mới xem được kênh này." tone="info" />;
}
