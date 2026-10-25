import { useState } from 'react';

/**
 * `useState` khởi tạo từ dữ liệu server NHƯNG tự đặt lại khi giá trị server đổi (máy khác đổi, tải lại nền, rollback).
 *
 * ⚠️ Vì sao không `useState(server)` trần: giá trị đầu chỉ được đọc MỘT lần lúc mount — màn giữ mounted (tab, màn dưới
 * stack) thì công tắc cứ hiện giá trị lúc mở màn dù server đã khác, tới khi tải lại app. Cũng không `useEffect` +
 * `setState` (`react-hooks/set-state-in-effect`): đặt lại NGAY trong render theo mẫu "lưu giá trị của lần render trước"
 * của React — không có nhịp vẽ giá trị cũ.
 *
 * Người dùng đổi tại chỗ (lạc quan) vẫn giữ được tới khi server trả giá trị MỚI.
 */
export function useServerSyncedState<T>(serverValue: T): [T, (next: T) => void] {
  const [value, setValue] = useState(serverValue);
  const [seen, setSeen] = useState(serverValue);
  if (!Object.is(seen, serverValue)) {
    setSeen(serverValue);
    setValue(serverValue);
  }
  return [value, setValue];
}
