import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Giữ màn hình sáng KHI `active` (`expo-keep-awake`, đã là phụ thuộc của `expo` nên không đòi dev-client mới). Dùng khi màn tự khoá sẽ làm hỏng việc đang làm:
 * đang thi thử có giờ (p4-02 app.md §6 — hết sáng giữa bài là mất nhịp làm và dễ trễ hạn nộp), đang chơi live quiz, đang trong phòng họp…
 *
 * · `tag` PHẢI khác nhau giữa các nơi dùng: thư viện đếm theo tag, hai màn cùng tag thì màn này nhả sẽ tắt luôn "giữ sáng" của màn kia.
 * · `active` chuyển true → false (hết giờ, đã nộp) hoặc gỡ màn ⇒ nhả NGAY — không giữ sáng lâu hơn cần thiết, tốn pin.
 * · Lỗi kích hoạt (thiết bị/hệ điều hành không cho) ⇒ nuốt: màn chỉ có thể tự khoá, không đáng làm hỏng màn đang chạy.
 */
export function useKeepAwake(tag: string, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    void activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(tag);
    };
  }, [tag, active]);
}
