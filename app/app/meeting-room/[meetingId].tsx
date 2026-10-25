import { useLocalSearchParams } from 'expo-router';

import { MeetingRoomScreen } from '@/features/meeting-room';

/** p2-05 app.md §1 — `meeting-room/[meetingId]` → `MeetingRoomScreen` (tự kiểm phiên đăng nhập: chưa đăng nhập → `/login`). */
export default function MeetingRoomRoute() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  return <MeetingRoomScreen meetingId={meetingId} />;
}
