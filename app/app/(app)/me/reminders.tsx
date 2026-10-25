import { MyRemindersScreen } from '@/features/chat-extensions/screens/MyRemindersScreen';

/** p7-04: "Nhắc lại của tôi". Nằm trong ngăn xếp `me/` (có `_layout.tsx`) nên KHÔNG thành tab. */
export default function MyRemindersRoute() {
  return <MyRemindersScreen />;
}
