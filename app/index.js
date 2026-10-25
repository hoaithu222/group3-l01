/**
 * Entry THẬT của app (`package.json` → `main`).
 *
 * Trước 01/10/2026 `main` là `expo-router/entry` và file này nằm chết: nó đăng ký
 * `setBackgroundMessageHandler` đi qua `react-native-callkeep`, mà gói đó không chạy được trên
 * RN 0.86 (lý do đầy đủ ở `app.config.ts`) — bật lên là app kẹt vĩnh viễn ở màn hình chờ.
 *
 * Nay file này sống lại với MỘT việc duy nhất và an toàn: đăng ký cây React **thứ hai**
 * `"IncomingCall"` cho `IncomingCallActivity` (màn gọi bung trên MÀN KHOÁ, p2-02).
 *
 * ── Hai điều KHÔNG được quên ──────────────────────────────────────────────────────
 *  1. `AppRegistry.registerComponent` phải chạy LÚC NẠP BUNDLE. Activity có thể dựng surface
 *     ngay khi JS vừa sẵn sàng; chưa đăng ký kịp thì màn gọi ra trắng và không có lỗi nào báo.
 *  2. Component nạp LƯỜI trong factory, không `import` ở đầu file: `import` kéo cả cây
 *     `features/calls` + providers vào MỌI lần mở app, kể cả khi không có cuộc gọi nào — chậm
 *     đúng chỗ nhạy cảm nhất (đường khởi động).
 *
 * ⛔ KHÔNG đăng ký `setBackgroundMessageHandler` ở đây nữa: chuông cuộc gọi khi app nền/bị tắt
 * do NATIVE lo (`plugins/call-notification/CallPushReceiver.kt`) — chạy ngay trong `onReceive`,
 * không phải chờ boot runtime JS. Thêm handler JS chỉ tạo nguồn thứ hai dựng cùng một chuông.
 */
import { AppRegistry } from 'react-native';

AppRegistry.registerComponent(
  'IncomingCall',
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp LƯỜI, xem khối trên
  () => require('./src/shell/lock-screen/IncomingCallRoot').IncomingCallRoot,
);

// `expo-router/entry` tự `registerRootComponent` cho root `"main"`. Đứng CUỐI (sau khi root thứ
// hai đã đăng ký) và cần `import/first` vì nó là import có tác dụng phụ đặt sau mã lệnh.
// eslint-disable-next-line import/first
import 'expo-router/entry';
