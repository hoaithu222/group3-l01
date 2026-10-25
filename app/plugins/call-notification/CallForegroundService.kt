package com.mancode.vungnui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service giữ cuộc gọi SỐNG khi app ra nền.
 *
 * ## Vì sao bắt buộc
 *
 * Từ Android 11 (mic) và 12 (camera), app ở NỀN **không được** đọc micro/camera nữa trừ khi có
 * một foreground service khai đúng `foregroundServiceType`. Không có nó thì đang gọi mà bấm Home
 * (hoặc mở app khác để tra cứu gì đó) là người kia **mất tiếng, mất hình** — và không có lỗi nào
 * hiện ra, LiveKit vẫn báo "connected" vì kết nối mạng chưa đứt. Đúng triệu chứng "gọi video hay
 * bị lỗi giữa chừng" mà không ai tái hiện được khi cầm máy nhìn vào màn hình.
 *
 * Trước đợt này app KHÔNG có service nào: `react-native-callkeep` đáng lẽ dựng hộ, nhưng nó bị
 * loại khỏi autolinking vì không chạy trên RN 0.86 (xem `app.config.ts`).
 *
 * ## Những chỗ dễ sập, đã xử
 *
 *  · Android 14 CẤM bật service kiểu `microphone`/`camera` khi app đang ở nền và khi quyền runtime
 *    tương ứng chưa được cấp. JS chỉ gọi `startCallService` lúc màn gọi đang hiện và media đã nối
 *    xong (tức quyền đã xin xong) — nhưng vẫn bọc try/catch: ném ở đây là **crash cả app**, trong
 *    khi hậu quả thật chỉ là "ra nền thì mất tiếng".
 *  · Kiểu service phải khớp thứ đang dùng: gọi thoại chỉ khai `microphone`. Khai thừa `camera` khi
 *    chưa có quyền camera là `SecurityException` ngay lúc `startForeground`.
 *  · Kênh thông báo để `IMPORTANCE_LOW`: thông báo này chỉ để hệ thống biết app đang chạy nền,
 *    không được kêu — chuông là việc của `CallPushReceiver`.
 */
class CallForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelfSafely()
            return START_NOT_STICKY
        }
        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty().ifEmpty { "Cuộc gọi" }
        val withCamera = intent?.getBooleanExtra(EXTRA_CAMERA, false) == true

        /**
         * ⛔ PHẢI gọi `startForeground` ở MỌI nhánh, kể cả nhánh hỏng.
         *
         * `startForegroundService()` ký một hợp đồng với hệ thống: service có ~5 giây để vào
         * tiền cảnh. KHÔNG vào được thì Android ném `ForegroundServiceDidNotStartInTimeException`
         * và **giết cả tiến trình app** — `stopSelf()` suông KHÔNG cứu được. Đó đúng là kiểu sự
         * cố "bấm Nghe là thoát app" (01/10/2026).
         *
         * Nên: thử với kiểu đầy đủ; hỏng (thiếu quyền runtime, Android 14 chặn vì app đã ra nền)
         * thì thử lại với kiểu RỖNG — vào tiền cảnh được là xong hợp đồng, chỉ mất quyền đọc
         * micro/camera khi ra nền. Hỏng cả hai mới chịu thua.
         */
        val notification = buildNotificationSafely(title)
        if (!enterForeground(notification, serviceTypes(withCamera)) && !enterForeground(notification, 0)) {
            Log.w(TAG, "không vào được tiền cảnh — cuộc gọi vẫn chạy khi app còn ở tiền cảnh")
            stopSelf()
        }
        // ⛔ KHÔNG `START_STICKY`: hệ thống dựng lại service sau khi giết app là dựng lại một
        // thông báo "đang gọi" cho cuộc gọi KHÔNG CÒN TỒN TẠI.
        return START_NOT_STICKY
    }

    private fun enterForeground(notification: android.app.Notification, types: Int): Boolean =
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types)
            true
        } catch (err: Exception) {
            Log.w(TAG, "startForeground(types=$types) thất bại", err)
            false
        }

    /**
     * Thông báo tối giản khi không dựng được bản đầy đủ — vẫn phải có MỘT notification để
     * `startForeground` chạy được (xem khối chú thích ở `onStartCommand`).
     */
    private fun buildNotificationSafely(title: String): android.app.Notification =
        try {
            notification(title)
        } catch (err: Exception) {
            Log.w(TAG, "không dựng được thông báo đầy đủ — dùng bản tối giản", err)
            ensureChannelSafely()
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle(title)
                .setOngoing(true)
                .setSilent(true)
                .build()
        }

    private fun ensureChannelSafely() {
        try {
            ensureChannel()
        } catch (err: Exception) {
            Log.w(TAG, "không tạo được kênh thông báo cuộc gọi đang diễn ra", err)
        }
    }

    private fun stopSelfSafely() {
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (err: Exception) {
            Log.w(TAG, "không hạ được foreground", err)
        }
        stopSelf()
    }

    /** Thoại: chỉ `microphone`. Video: thêm `camera` — chỉ khi JS báo camera đang thật sự bật. */
    private fun serviceTypes(withCamera: Boolean): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        if (withCamera && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        }
        return types
    }

    private fun notification(title: String): android.app.Notification {
        ensureChannel()
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentTitle(title)
            .setContentText("Cuộc gọi đang diễn ra")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp())
            .build()
    }

    /** Chạm vào thông báo = quay lại app (deep link màn cuộc gọi do app tự điều hướng theo store). */
    private fun openApp(): PendingIntent? {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        intent.setData(Uri.parse("${CallPushReceiver.SCHEME}://call"))
        return PendingIntent.getActivity(
            this,
            REQUEST_OPEN,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Cuộc gọi đang diễn ra", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Giữ micro/camera hoạt động khi bạn chuyển sang ứng dụng khác"
        channel.setSound(null, null)
        channel.enableVibration(false)
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val TAG = "CallForegroundService"
        const val CHANNEL_ID = "superapp-call-ongoing-v1"
        const val NOTIFICATION_ID = 42_001
        const val REQUEST_OPEN = 42
        const val ACTION_STOP = "com.mancode.vungnui.CALL_FGS_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_CAMERA = "camera"

        fun start(context: Context, title: String, withCamera: Boolean) {
            val intent = Intent(context, CallForegroundService::class.java)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_CAMERA, withCamera)
            try {
                context.startForegroundService(intent)
            } catch (err: Exception) {
                Log.w(TAG, "không khởi động được service cuộc gọi", err)
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, CallForegroundService::class.java))
            } catch (err: Exception) {
                Log.w(TAG, "không dừng được service cuộc gọi", err)
            }
        }
    }
}
