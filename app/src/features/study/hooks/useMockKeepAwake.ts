import { useKeepAwake } from '@/shared/hooks/useKeepAwake';

/** Tag riêng của màn thi thử — khác tag của live quiz/phòng họp để nhả bên này không tắt "giữ sáng" của bên kia. */
export const MOCK_KEEP_AWAKE_TAG = 'study-mock-attempt';

/**
 * Giữ màn hình sáng suốt lúc làm bài thi thử (p4-02 app.md §6 `expo-keep-awake`): màn tự khoá giữa bài là mất nhịp làm, và đồng hồ vẫn chạy nên dễ
 * trễ hạn nộp. `active` = bài còn đang làm (chưa hết giờ/đã nộp) — `MockPlayer` truyền `ended === null`; hết bài thì nhả ngay.
 */
export function useMockKeepAwake(active: boolean): void {
  useKeepAwake(MOCK_KEEP_AWAKE_TAG, active);
}
