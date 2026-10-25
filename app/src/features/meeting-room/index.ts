/**
 * Mặt tiền công khai của `meeting-room` (p2-05): pre-join, phòng chờ/lobby, phòng họp LiveKit, điều khiển chủ trì.
 * ROUTE `app/meeting-room/[meetingId].tsx` trỏ vào `MeetingRoomScreen`; `MeetingRoomHost` do `app/(app)/_layout.tsx` gắn một lần (giữ phòng khi
 * thu nhỏ + vẽ `MeetingMiniBar`). Feature khác KHÔNG import từ đây — mở phòng họp qua đường dẫn `/meeting-room/[meetingId]`.
 */
export { MeetingRoomHost } from './components/MeetingRoomHost';
export { resetMeetingRoomStores } from './hooks/reset-meeting-room-stores';
export { MeetingRoomScreen } from './screens/MeetingRoomScreen';
export type { MeetingRoomScreenProps } from './screens/MeetingRoomScreen';
