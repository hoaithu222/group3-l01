import { isWellbeingRoute } from './wellbeing-routes';

/**
 * Route mà cảnh báo nổi KHÔNG hiện (app.md p7-03 §7): đang làm bài thi thử (đồng hồ chạy), đang gọi/họp, đang chơi live quiz. Một lời nhắc nghỉ ngơi chen giữa
 * bài thi hay cuộc gọi vừa vô nghĩa vừa gây rối — thẻ vẫn còn ở BE (`pendingAlert`) nên hiện lại ngay khi người dùng rời route đó.
 * ⚠️ Cùng danh sách với `features/gamification/utils/gamification-events.ts` (`DEFERRED_ROUTE_PATTERNS`), chép lại vì hai feature không import nhau; route hoãn mới
 * thì thêm ở CẢ HAI. Nhận diện theo đường dẫn (`usePathname()` đã bỏ nhóm `(app)`).
 */
const QUIET_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/study\/attempts\//,
  /^\/call\//,
  /^\/meetings\/[^/]+\/room(\/|$)/,
  /^\/study\/live\/(?!join$|host$|history$)[^/]+\/?$/,
];

/** Không hiện thẻ nổi ở: các route trên, và chính nhánh `me/wellbeing` (`isWellbeingRoute`). */
export function isAlertSuppressedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    isWellbeingRoute(pathname) || QUIET_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}
