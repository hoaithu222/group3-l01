import type { Href } from 'expo-router';

/**
 * Lịch sử học cá nhân (app.md p5-02 §1, P1): `app/(app)/me/pomodoro-history.tsx`. ⚠️ Ép `Href`: file định kiểu route (`.expo/types/router.d.ts`) do
 * `expo start` sinh lại nên chưa có đường dẫn mới cho tới lần chạy dev-server kế tiếp — không ép thì `tsc` đỏ dù route đã có thật.
 */
export const POMODORO_HISTORY_HREF = '/me/pomodoro-history' as Href;
