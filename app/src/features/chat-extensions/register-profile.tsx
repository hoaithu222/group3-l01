import { registerProfileRow } from '@/shared/profile';

import { RemindersMeRow, ScheduledMeRow } from './components/host/ChatExtMeRows';

// p7-04: hai lối vào "Tin đã hẹn" và "Nhắc lại của tôi" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `chat-extensions` (`feature-structure.md`). Module này chỉ có tác dụng
// phụ (đăng ký); nơi lắp ráp import nó ở `shell/chat/register-chat-extensions.ts` (nạp từ `app/_layout.tsx`). Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('chat-extensions.scheduled', () => <ScheduledMeRow />);
registerProfileRow('chat-extensions.reminders', () => <RemindersMeRow />);
