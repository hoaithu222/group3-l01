import { useState } from 'react';

/**
 * Giữ lại yêu cầu CUỐI CÙNG khi nó đã về `null`, để một tấm trượt (`BottomSheet`) còn nội dung mà
 * vẽ nốt lúc đang trượt xuống — trả `null` ngay thì nội dung biến mất một nhịp TRƯỚC khi tấm khuất.
 *
 * `session` tăng mỗi khi có yêu cầu MỚI (kể cả cùng đích với lần trước): dùng làm `key` của phần
 * ruột để form khởi tạo lại — không thì mở báo cáo cùng một tin lần hai vẫn thấy biên nhận "Đã gửi"
 * của lần đầu.
 *
 * ⚠️ `setState` TRONG lúc render là cách React khuyến nghị cho "state suy ra từ prop" (điều kiện,
 * không vô hạn) — không dùng `useEffect`: effect chạy SAU lần vẽ đầu nên khung hình đầu của yêu cầu
 * mới vẫn vẽ ruột của yêu cầu cũ.
 */
export function useRetainedRequest<T>(request: T | null): { retained: T | null; session: number } {
  const [state, setState] = useState<{ retained: T | null; session: number }>({ retained: request, session: 0 });
  if (request !== null && request !== state.retained) {
    setState({ retained: request, session: state.session + 1 });
  }
  return state;
}
