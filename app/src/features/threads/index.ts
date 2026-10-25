/**
 * Mặt tiền công khai của `threads` (p1-06). Route `channels/[chId]/thread/[messageId]` trỏ thẳng vào
 * `screens/ThreadScreen` (cùng cách mọi feature khác); màn kênh KHÔNG import feature này — nó nối điều
 * hướng qua `ChatRoom.onOpenThread` (chat → route), xem `docs/rules/feature-structure.md`.
 */
export { ThreadScreen } from './screens/ThreadScreen';
export { ChannelThreadsScreen } from './screens/ChannelThreadsScreen';
