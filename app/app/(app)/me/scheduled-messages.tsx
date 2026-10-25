import { ScheduledMessagesScreen } from '@/features/chat-extensions/screens/ScheduledMessagesScreen';

/** p7-04: "Tin đã hẹn" của tôi. Nằm trong ngăn xếp `me/` (có `_layout.tsx`) nên KHÔNG thành tab. `?scopeType&scopeId` lọc theo phòng, `?id` tô dòng từ thông báo. */
export default function ScheduledMessagesRoute() {
  return <ScheduledMessagesScreen />;
}
