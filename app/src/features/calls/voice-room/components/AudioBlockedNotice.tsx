import { Alert } from '@/shared/ui/alert';

/**
 * Chủ phòng đã chặn phát biểu của mình (VR-08): nút mic khoá + dòng này nói rõ LÝ DO (không để người dùng tưởng mic hỏng). Bỏ chặn chỉ
 * trả lại QUYỀN — người dùng tự bật mic, nên khi hết chặn dòng này biến mất và có toast "Bạn có thể bật mic lại".
 */
export function AudioBlockedNotice() {
  return <Alert description="Chủ phòng đã chặn phát biểu — bạn vẫn nghe được mọi người." tone="warning" />;
}
