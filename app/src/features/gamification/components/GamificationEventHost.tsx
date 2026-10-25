import { useGamificationEvents } from '../hooks/useGamificationEvents';
import { LevelUpModal } from './LevelUpModal';

/**
 * Lớp TOÀN CỤC nghe `gamification:updated` và hiện `LevelUpModal` / toast huy hiệu trên MỌI màn (app.md p4-03 §2).
 * Điều phối viên mount MỘT lần trong `app/(app)/_layout.tsx` (nhóm route đã đăng nhập); cờ `gamification` tắt ⇒ không
 * gọi API, không hiện gì. Hàng đợi nằm trong state của hook (bộ nhớ) — đăng xuất là unmount ⇒ tự sạch.
 */
export function GamificationEventHost() {
  const { current, dismiss, xpToNext } = useGamificationEvents();
  return <LevelUpModal item={current} xpToNext={xpToNext} onDismiss={dismiss} />;
}
