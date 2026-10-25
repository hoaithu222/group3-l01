/** `AudioContext` có tiền tố `webkit` ở Safari cũ; kiểu DOM chuẩn chưa khai `webkitAudioContext`. */
interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Tiếng "ting" ngắn báo đơn mới — TỔNG HỢP bằng Web Audio (một dao động sin 880 Hz tắt dần 0,6 giây), không cần tệp âm thanh nào.
 * Trình duyệt chặn phát âm thanh trước khi người dùng từng tương tác với trang (autoplay policy) hoặc không có Web Audio → bỏ qua
 * lặng lẽ: vẫn còn thông báo trên màn hình và số đơn ở tiêu đề tab, đơn mới không bị bỏ lỡ chỉ vì thiếu tiếng.
 */
export function playNewOrderSound(): void {
  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => void ctx.close();
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Bị chặn hoặc thiết bị không có đầu ra âm thanh — bỏ qua (xem chú thích trên).
  }
}
