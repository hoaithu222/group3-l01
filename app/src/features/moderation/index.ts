/**
 * Mặt tiền công khai của `moderation` (p1-08) — báo cáo, kiểm duyệt phạm vi, chặn người dùng.
 *
 * Chỉ NƠI LẮP RÁP (`app/**`, `shell/`) import từ đây. Các feature nghiệp vụ (`chat`, `members`, `channels`,
 * `conversations`) KHÔNG import `moderation` — chúng "yêu cầu" mở tấm Báo cáo/Chặn qua
 * `@/shared/hooks/useModerationActions` và đọc "ai bị chặn" qua `@/shared/hooks/useBlockedIds`
 * (`docs/rules/feature-structure.md` mục "Nối chat/members/channels/conversations ↔ moderation").
 */
export { BlockedUsersScreen } from './screens/BlockedUsersScreen';
export { ScopeReportsScreen } from './screens/ScopeReportsScreen';
export type { ScopeReportsScreenProps } from './screens/ScopeReportsScreen';
export { ModerationHost } from './components/ModerationHost';
export { ModerationHubCard } from './components/ModerationHubCard';
export { useBlockedSync } from './hooks/useBlockedSync';
