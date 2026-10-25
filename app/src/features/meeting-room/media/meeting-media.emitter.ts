import type { MeetingMediaEvent } from './meeting-media.types';

type Listener = (event: MeetingMediaEvent) => void;

/**
 * Bộ phát sự kiện dùng CHUNG cho adapter LiveKit và bản giả: mỗi người đăng ký có hàm huỷ RIÊNG (⛔ không `removeAllListeners` — bài học
 * Sun). Phát trên BẢN SAO danh sách để listener tự huỷ đăng ký giữa lúc phát không làm lệch vòng lặp.
 */
export class MeetingMediaEmitter {
  private readonly listeners = new Set<Listener>();

  get size(): number {
    return this.listeners.size;
  }

  emit(event: MeetingMediaEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}
