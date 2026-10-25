import { AcceptInvitationScreen } from '@/features/members/screens/AcceptInvitationScreen';

/**
 * `https://…/invite/e/{token}` — lời mời ĐÍCH DANH theo email (p3-04). Ngoài `(app)`
 * để mở được cả khi chưa đăng nhập, cùng lý do `invite/[code].tsx`.
 */
export default function AcceptInvitationRoute() {
  return <AcceptInvitationScreen />;
}
