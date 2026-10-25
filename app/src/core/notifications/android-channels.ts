import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Kênh thông báo Android (p0-06 `app.md` §6, D-15).
 *
 * `id` PHẢI khớp `android.channelId` mà BE gửi trong FCM (`PushPayload.androidChannel`,
 * `firebase-push.sender.ts`): id lạ thì Android âm thầm rơi về kênh mặc định của
 * expo-notifications (`fallback`), và người dùng tắt tiếng "Nhắc đến" trong Cài đặt
 * hệ thống mà không có tác dụng gì.
 *
 * ⛔ Android KHÔNG cho ứng dụng đổi âm thanh/mức ưu tiên của kênh ĐÃ TẠO (chỉ người
 * dùng đổi được; tạo lại cùng `id` cũng giữ cài đặt cũ). Muốn đổi thì phải ĐỔI `id` — mà
 * `id` lại là hợp đồng với BE. Vì vậy hai chỗ sau phải chốt TRƯỚC bản phát hành đầu:
 *   · `mentions` — app.md muốn `mention.wav`; tệp chưa có trong `assets/`, nên hiện dùng
 *     âm mặc định.
 *   · `calls` — nhạc chuông do p2-02 quyết; hiện dùng âm mặc định.
 */
export const ANDROID_CHANNEL_IDS = {
  calls: 'superapp-call-ring-v1',
  default: 'default-v2',
  mentions: 'mentions-v2',
} as const;

/**
 * Kênh của các bản TRƯỚC — chỉ còn để XOÁ đi.
 *
 * ⛔ Chúng được tạo với `sound: null`, mà trong `expo-notifications` `null` nghĩa là **IM LẶNG**
 * chứ không phải "âm mặc định" (xem `createSoundUriFromArguments`: thiếu khoá `sound` mới là
 * `DEFAULT_NOTIFICATION_URI`). Hậu quả: MỌI thông báo của app câm trên máy thật.
 *
 * Android KHOÁ cấu hình kênh đã tạo, và xoá rồi tạo lại CÙNG id thì hệ thống khôi phục nguyên cấu
 * hình cũ — nên bắt buộc phải ĐỔI ID (hậu tố `-v2`). BE gửi tên LOGIC (`default`/`mentions`/`calls`)
 * và `firebase-push.sender.ts` ánh xạ sang id thật, nên hợp đồng BE↔app không đổi.
 */
const LEGACY_CHANNEL_IDS = ['default', 'mentions', 'calls'] as const;
export type AndroidChannelId = (typeof ANDROID_CHANNEL_IDS)[keyof typeof ANDROID_CHANNEL_IDS];

export interface AndroidChannelSpec {
  /** Chỉ có tác dụng khi người dùng cấp quyền "Không làm phiền" cho app — Android tự quyết. */
  bypassDnd: boolean;
  description: string;
  id: AndroidChannelId;
  importance: Notifications.AndroidImportance;
  name: string;
  /**
   * Âm thanh của kênh:
   *   · `undefined` (BỎ HẲN khoá) = âm thông báo mặc định của hệ thống.
   *   · Chuỗi = tên file tuỳ chỉnh đã khai trong `sounds` của plugin `expo-notifications`
   *     (vd `'mention.wav'`). ⛔ Truyền `'default'` là lỗi: thư viện tìm file tên "default".
   *
   * ⛔ TUYỆT ĐỐI KHÔNG truyền `null`: trong `expo-notifications`, `null` = **IM LẶNG**. Đó đúng
   * là lỗi "thông báo không có tiếng" đã trả giá bằng một bản phát hành (01/10/2026).
   */
  sound?: string;
  vibrate: boolean;
}

/** Bảng kênh — nguồn duy nhất, test đối chiếu với `app.md` §6. */
export const ANDROID_CHANNELS: readonly AndroidChannelSpec[] = [
  {
    bypassDnd: false,
    description: 'Tin nhắn, lời mời và các thông báo thông thường.',
    id: 'default-v2',
    importance: Notifications.AndroidImportance.HIGH,
    name: 'Thông báo chung',
    vibrate: true,
  },
  {
    bypassDnd: false,
    description: 'Khi có người nhắc tên bạn hoặc trả lời trong luồng của bạn.',
    id: 'mentions-v2',
    importance: Notifications.AndroidImportance.HIGH,
    name: 'Nhắc đến & trả lời',
    vibrate: true,
  },
  /**
   * ⛔ KHÔNG còn kênh `calls` ở đây (01/10/2026).
   *
   * Chuông cuộc gọi do NATIVE dựng (`plugins/call-notification/CallPushReceiver.kt`) trên kênh
   * `superapp-call-ring-v1` — kênh duy nhất đặt được NHẠC CHUÔNG thật
   * (`RingtoneManager.TYPE_RINGTONE`); `expo-notifications` chỉ nhận âm thông báo hoặc file trong
   * `res/raw`, mà dự án chưa có tài sản âm thanh nào.
   *
   * Tạo lại `calls` ở đây là người dùng thấy HAI mục trùng nghĩa trong Cài đặt → Thông báo, và
   * tắt nhầm mục không có tác dụng. Native tự `deleteNotificationChannel("calls")` để dọn kênh
   * cũ trên máy đã cài bản trước.
   *
   * `ANDROID_CHANNEL_IDS.calls` thì GIỮ: nó là hợp đồng với BE (`PushPayload.androidChannel`),
   * và các push `call.*` còn lại đều là data-only nên không cần kênh nào tồn tại.
   */
];

/** Mẫu rung — cùng nhịp mặc định của Android, viết ra để kênh không phụ thuộc mặc định của thư viện. */
const VIBRATION_PATTERN = [0, 250, 250, 250];

/**
 * Tạo (hoặc cập nhật) các kênh. Idempotent — gọi mỗi lần khởi động.
 *
 * ⛔ PHẢI chạy TRƯỚC `requestPermissionsAsync()`: từ Android 13, hộp thoại xin
 * `POST_NOTIFICATIONS` chỉ hiện khi app đã có ít nhất một kênh. Không có kênh thì lời gọi
 * xin quyền trả `denied` ngay, không hỏi người dùng — và họ không có cách nào bật lại
 * trong app (chỉ còn Cài đặt hệ thống).
 *
 * Không làm gì ngoài Android (iOS không có khái niệm kênh).
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all(
    ANDROID_CHANNELS.map((channel) =>
      Notifications.setNotificationChannelAsync(channel.id, {
        bypassDnd: channel.bypassDnd,
        description: channel.description,
        enableVibrate: channel.vibrate,
        importance: channel.importance,
        name: channel.name,
        showBadge: true,
        // ⛔ CHỈ truyền `sound` khi có file tuỳ chỉnh. Truyền `null`/`undefined` tường minh là
        // expo gửi khoá `sound` xuống native, và native hiểu "có khoá nhưng rỗng" = IM LẶNG.
        // Muốn âm mặc định của hệ thống thì khoá đó phải VẮNG MẶT hoàn toàn.
        ...(channel.sound === undefined ? {} : { sound: channel.sound }),
        vibrationPattern: channel.vibrate ? VIBRATION_PATTERN : null,
      }),
    ),
  );

  /**
   * Dọn kênh của bản cũ (im lặng) — làm SAU khi đã tạo kênh mới để Android luôn còn ít nhất một
   * kênh (điều kiện để hộp thoại `POST_NOTIFICATIONS` hiện được). Kênh không tồn tại thì lời gọi
   * này là no-op; nuốt lỗi vì đây chỉ là dọn dẹp.
   */
  await Promise.all(
    LEGACY_CHANNEL_IDS.map((id) =>
      Notifications.deleteNotificationChannelAsync(id).catch(() => undefined),
    ),
  );
}
