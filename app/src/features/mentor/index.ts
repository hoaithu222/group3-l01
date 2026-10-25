/**
 * Mặt tiền công khai của feature Mentor Connect (p6-03) — route trong `app/(app)/mentor/**` và
 * `app/(app)/workspaces/[wsId]/mentor/**` trỏ vào các màn này.
 */
export { MentorBoardScreen } from './screens/MentorBoardScreen';
export { MentorPostDetailScreen } from './screens/MentorPostDetailScreen';
export { WorkspaceMentorScreen } from './screens/WorkspaceMentorScreen';
export { CreateMentorPostScreen } from './screens/CreateMentorPostScreen';
export { ApplicationReviewScreen } from './screens/ApplicationReviewScreen';
// p6-03: banner cho cố vấn (khách) ở hub nhóm — nơi lắp ráp (`app/(app)/workspaces/[wsId]/index.tsx`) ghép qua `guestBanners`.
export { MentorGuestBanner } from './components/MentorGuestBanner';
// p6-03: thẻ tin hệ thống `MENTOR_JOINED`/`MENTOR_LEFT` — `shell/chat/register-mentor-cards.tsx` đăng ký vào registry của `chat`.
export { MentorSystemMessage } from './components/MentorSystemMessage';
