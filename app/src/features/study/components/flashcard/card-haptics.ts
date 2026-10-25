import * as Haptics from 'expo-haptics';

/**
 * Rung phản hồi của phiên thẻ. Theo cài đặt rung của hệ điều hành (tắt rung là không rung); lỗi (máy không có động cơ rung) nuốt
 * im lặng — rung chỉ là phần thưởng cho cử chỉ, không được làm hỏng việc học. `Promise.resolve` bọc ngoài để bản mock trả
 * `undefined` (Jest) cũng không ném lỗi.
 *
 * Rung KHÔNG gắn với "Giảm chuyển động": đó là hai giác quan khác nhau, và người bật Giảm chuyển động vẫn muốn biết cú chạm đã ăn.
 */
const swallow = (): void => undefined;

/** Lật thẻ, chạm ngưỡng vuốt — nhẹ nhất, chỉ để xác nhận. */
export function tickHaptic(): void {
  Promise.resolve(Haptics.selectionAsync()).catch(swallow);
}

/** Chấm thẻ (đã thuộc/chưa thuộc/mức nhớ). */
export function commitHaptic(): void {
  Promise.resolve(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(swallow);
}

/** Hoàn thành phiên — mạnh hơn một nấc, đúng một lần. */
export function celebrateHaptic(): void {
  Promise.resolve(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)).catch(swallow);
}
