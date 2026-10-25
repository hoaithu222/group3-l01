import { Stack } from 'expo-router';

/**
 * p2-05 app.md §1 — phòng họp TOÀN MÀN, NGOÀI nhóm `(app)` (không thanh tab). Không vuốt để đóng: rời phòng bằng nút "Rời"/"Thu nhỏ"
 * (media sống ở controller, không ở màn này). Kiểu trình bày `fullScreenModal` của route cha khai ở `app/_layout.tsx` (`meeting-room`).
 */
export default function MeetingRoomLayout() {
  return <Stack screenOptions={{ gestureEnabled: false, headerShown: false, presentation: 'fullScreenModal' }} />;
}
