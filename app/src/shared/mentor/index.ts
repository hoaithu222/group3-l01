/**
 * Thành phần HIỂN THỊ dùng chung của Mentor Connect (p6-03) — `members` (danh sách/thẻ thành viên) import từ đây thay vì `features/mentor`
 * (feature không import chéo). Không gọi API: nơi dùng tự có dữ liệu (`displayTag`, `expiresAt` của thành viên).
 */
export { MemberMentorTag } from './MemberMentorTag';
export type { MemberMentorTagProps } from './MemberMentorTag';
export { MentorTag } from './MentorTag';
export type { MentorTagProps } from './MentorTag';
export { isMentorTag, MENTOR_DISPLAY_TAG } from './mentor-tag';
