/**
 * Mặt tiền công khai của `meeting-recap` (p2-06): biên bản (xem/soạn/công bố + tệp) và bản ghi cuộc họp (danh sách, phát, tải về, xoá).
 * Route `app/(app)/meetings/[meetingId]/{recap,recap-edit,recordings/index,recordings/[recordingId]}.tsx` trỏ vào các màn dưới đây.
 * Ghi hình TRONG PHÒNG (đồng ý, nút ghi, chỉ báo) nằm ở `features/meeting-room`. Feature khác KHÔNG import từ đây — mở màn bằng đường dẫn.
 *
 * Thẻ tin hệ thống `MEETING_RECAP`/`MEETING_RECORDING_READY` do NƠI LẮP RÁP đăng ký vào chat (`app/(app)/_layout.tsx`):
 * `registerSystemMessageRenderer('MEETING_RECAP', (m) => <MeetingRecapMessage message={m} />)` (tương tự cho bản ghi).
 */
export { MeetingRecapMessage } from './components/cards/MeetingRecapMessage';
export { MeetingRecordingReadyMessage } from './components/cards/MeetingRecordingReadyMessage';
export { RecapEditorScreen } from './screens/RecapEditorScreen';
export { RecapScreen } from './screens/RecapScreen';
export { RecordingPlayerScreen } from './screens/RecordingPlayerScreen';
export { RecordingsScreen } from './screens/RecordingsScreen';
export { clearRecordingDownloads } from './utils/recording-files';
