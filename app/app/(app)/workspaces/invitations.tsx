import { MyInvitationsScreen } from '@/features/members/screens/MyInvitationsScreen';

/**
 * "Lời mời của tôi" (p3-04) — `GET /me/invitations`. Cùng cấp `new.tsx`/`pending.tsx`, NGOÀI `[wsId]/`: đây là
 * danh sách lời mời của tài khoản, không thuộc phạm vi một nhóm nào (và người chưa vào nhóm không đọc được nhóm).
 */
export default function MyInvitationsRoute() {
  return <MyInvitationsScreen />;
}
