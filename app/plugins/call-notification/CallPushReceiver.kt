package com.mancode.vungnui

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

/**
 * Dựng thông báo CUỘC GỌI ĐẾN hoàn toàn bằng native — không qua JavaScript.
 *
 * ## Vì sao phải là native
 *
 * Đường cũ của dự án là `setBackgroundMessageHandler` (JS) + `react-native-callkeep`.
 * Cả hai đều hỏng: CallKeep không chạy trên RN 0.86 (xem `app.config.ts`), còn JS nền
 * phải boot cả runtime trước khi kịp dựng chuông — chậm, và chỉ cần BE hạ `priority`
 * xuống normal là chết câm.
 *
 * Bày thông báo ngay trong `onReceive` thì KHÔNG bị cấm, chạy tức thì, và là chỗ DUY
 * NHẤT đặt được nhạc chuông thật (`RingtoneManager.TYPE_RINGTONE`) — `expo-notifications`
 * chỉ nhận âm thông báo hoặc file trong `res/raw`.
 *
 * ## Hai lối vào khác nhau, đừng lẫn
 *
 * - **Full-screen intent → `IncomingCallActivity`** (Activity duy nhất khai `showWhenLocked`):
 *   đường chính khi máy đang khoá / màn hình tắt. Nghe và Từ chối xảy ra TRONG activity đó
 *   nên không phải mở khoá.
 * - **`setContentIntent` + 2 nút trên khay → deep link `superapp://call/<id>?action=…`**:
 *   chỉ tới lượt khi máy đã mở khoá (Android cố ý hạ FSI xuống heads-up lúc đang dùng máy,
 *   hoặc quyền "Thông báo toàn màn hình" chưa được cấp).
 *
 * ⚠️ Receiver KHÔNG được `abortBroadcast()`: `com.google.android.c2dm.intent.RECEIVE` còn
 * phải tới `ReactNativeFirebaseMessagingReceiver` để chat/thông báo khác chạy tiếp.
 */
class CallPushReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val type = extras.getString(KEY_TYPE) ?: return
        if (!type.startsWith(TYPE_PREFIX)) return

        val callId = extras.getString(KEY_CALL_ID).orEmpty()
        try {
            // Máy đã đổi chủ: push đi theo token FCM cũ chưa kịp thu hồi. `null` = chưa biết
            // (JS chưa từng chạy) ⇒ KHÔNG chặn, thà reo thừa còn hơn nuốt chuông của đúng chủ.
            val me = LockScreenCallState.currentUserId(context)
            val target = extras.getString(KEY_TARGET_USER_ID)
            if (me != null && !target.isNullOrEmpty() && me != target) return

            if (type != TYPE_RING) {
                // Mọi tín hiệu khác (huỷ · đã nghe máy khác · nhỡ) đều là "thôi đừng reo nữa".
                cancelIncomingCall(context, type, callId)
                return
            }
            // Chuông ma: push nằm lại hàng đợi FCM quá hạn đổ chuông rồi mới tới.
            if (isExpired(extras.getString(KEY_EXPIRES_AT))) return
            // App đang mở VÀ có đường hiện cuộc gọi trong app → để socket lo, bày thêm thông báo
            // là hiện hai thứ cho cùng một cuộc gọi.
            if (isAppInForeground(context) && LockScreenCallState.callUiReady) return
            showIncomingCall(context, extras, callId)
        } catch (err: Exception) {
            Log.e(TAG, "không dựng được thông báo cuộc gọi", err)
        }
    }

    private fun showIncomingCall(context: Context, extras: Bundle, callId: String) {
        // Thiếu `callId` thì không có gì để đối chiếu lúc nhận/tắt máy — chuông ma không bấm được.
        if (callId.isEmpty()) {
            Log.w(TAG, "push cuộc gọi thiếu callId — bỏ qua")
            return
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            Log.w(TAG, "người dùng đã tắt thông báo — không hiện được chuông")
            return
        }

        // Rỗng khi người nhận đặt `lockScreenLevel = HIDDEN` (be.md §13.3).
        val caller = extras.getString(KEY_CALLER_NAME).orEmpty().ifEmpty { DEFAULT_CALLER }
        val isVideo = extras.getString(KEY_MEDIA_KIND) == MEDIA_VIDEO
        // Chỉ nhóm/kênh/họp mới cần tên phạm vi; 1-1 thì tên người gọi đã là đủ.
        val scopeTitle = extras.getString(KEY_SCOPE_TITLE).orEmpty()
        val scopeKind = extras.getString(KEY_SCOPE_KIND).orEmpty()
        val isGroup = scopeKind.isNotEmpty() && scopeKind != SCOPE_DIRECT

        ensureChannel(context)

        val groupText = if (isVideo) "cuộc gọi video nhóm" else "cuộc gọi nhóm"
        // Nhóm: tên NHÓM là thứ người nhận cần nhận ra trước; 1-1 thì tên người gọi.
        val headline = if (isGroup && scopeTitle.isNotEmpty()) scopeTitle else caller

        /**
         * `CallStyle` — kiểu thông báo CUỘC GỌI do chính Android vẽ.
         *
         * ⛔ Trước đây dùng hai `addAction` trần: hệ thống xếp chúng thành hai nhãn CHỮ dính sát
         * nhau, không khoảng cách, không màu — bấm nhầm Từ chối khi định bấm Nghe là chuyện sớm
         * muộn. `CallStyle` cho đúng cặp nút "Từ chối" đỏ / "Nghe" xanh, cỡ lớn, giãn cách chuẩn,
         * và trên màn khoá thì được hệ thống ưu tiên hiển thị như cuộc gọi thật.
         *
         * Điều kiện để Android KHÔNG hạ cấp nó về thông báo thường: phải `setOngoing(true)` và có
         * `fullScreenIntent` (hoặc chạy kèm foreground service) — cả hai đều có ngay bên dưới.
         * API < 31 thì androidx tự vẽ lại bố cục tương đương, không cần nhánh riêng.
         */
        val person = Person.Builder().setName(headline).setImportant(true).build()
        val callStyle = NotificationCompat.CallStyle.forIncomingCall(
            person,
            deepLink(context, ACTION_DECLINE, callId, 1),
            deepLink(context, ACTION_ACCEPT, callId, 2),
        ).setIsVideo(isVideo)
        // Dòng phụ: 1-1 nói rõ thoại hay video; nhóm nói rõ AI đang mời (tiêu đề đã là tên nhóm).
        callStyle.setVerificationText(
            if (isGroup) "$caller đang mời bạn vào $groupText"
            else if (isVideo) "Cuộc gọi video đến" else "Cuộc gọi thoại đến",
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_icon)
            .setStyle(callStyle)
            // Giữ cho bản API < 31 và cho các ROM hạ cấp `CallStyle` về thông báo thường.
            .setContentTitle(headline)
            .setContentText(if (isGroup) "$caller đang mời bạn vào $groupText" else caller)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            // Chuông cuộc gọi không được tự trôi đi như thông báo thường.
            .setOngoing(true)
            .setAutoCancel(false)
            // Hiện đầy đủ trên màn khoá — người ta cần biết AI gọi trước khi mở máy.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Tự dọn khi hết hạn đổ chuông, không để lại "cuộc gọi đến" treo vĩnh viễn nếu
            // tín hiệu kết thúc bị mất.
            .setTimeoutAfter(timeoutMs(extras.getString(KEY_EXPIRES_AT)))
            .setContentIntent(deepLink(context, ACTION_OPEN, callId, 0))

        /**
         * `fullScreenIntent` = màn hình gọi TỰ BUNG khi máy đang khoá.
         *
         * ⛔ PHẢI trỏ vào `IncomingCallActivity` (Activity duy nhất khai `showWhenLocked`),
         * KHÔNG phải deep link về `MainActivity`: hệ thống vẫn kích hoạt intent nhưng keyguard
         * che mất Activity ⇒ người dùng chỉ thấy đúng cái thông báo.
         *
         * Máy đang dùng dở thì Android cố ý hạ xuống heads-up — đúng tài liệu, không phải lỗi.
         * Từ Android 14 còn cần người dùng bật riêng quyền "Thông báo toàn màn hình"
         * (dò bằng `LockScreenCall.canUseFullScreenIntent()`).
         */
        builder.setFullScreenIntent(lockScreenIntent(context, extras, callId), true)

        // Chuông hệ thống của kênh đang kêu ⇒ phía JS PHẢI câm (xem `useIncomingRingtone`).
        LockScreenCallState.nativeRingActive = true
        // Để JS hạ được chuông này qua `LockScreenCall.dismiss()` mà không phải đợi gói FCM kế tiếp.
        LockScreenCallState.ringingCallId = callId

        NotificationManagerCompat.from(context)
            .notify(NOTIFICATION_TAG, notificationId(callId), builder.build())
    }

    /**
     * Mọi tín hiệu "thôi reo" (huỷ · đã nghe ở máy khác · nhỡ).
     *
     *  1. hạ chuông hệ thống (huỷ notification + cờ) — luôn làm;
     *  2. **báo sang JS**: khi app đã bị vuốt tắt thì root trong `IncomingCallActivity` là JS
     *     duy nhất đang sống, mà nó chưa chắc đã kịp nối socket ⇒ không bắc cầu ở đây là cuộc
     *     gọi bị bên kia huỷ sẽ không ai biết;
     *  3. đóng màn gọi — **chỉ khi JS chưa cầm cuộc** (`holdActive`).
     */
    private fun cancelIncomingCall(context: Context, type: String, callId: String) {
        if (callId.isEmpty()) return
        LockScreenCallState.nativeRingActive = false
        if (LockScreenCallState.ringingCallId == callId) LockScreenCallState.ringingCallId = null
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_TAG, notificationId(callId))
        LockScreenCallState.emitSignal(type, callId)
        IncomingCallActivity.finishFor(callId)
    }

    /**
     * Kênh riêng cho cuộc gọi: nhạc chuông (không phải tiếng "ting" thông báo) + rung +
     * `IMPORTANCE_HIGH` để nổi heads-up.
     *
     * ⚠️ Android KHÔNG cho sửa kênh đã tạo — đổi âm/độ ưu tiên phải đổi luôn `CHANNEL_ID`.
     * Kênh `calls` do `core/notifications/android-channels.ts` tạo ở bản trước chỉ có âm thông
     * báo mặc định; dọn nó đi để Cài đặt không còn hai mục trùng nghĩa.
     */
    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager == null) {
            // `notify()` vào kênh chưa tồn tại thì Android VỨT IM LẶNG — triệu chứng giống hệt
            // "push không tới máy", phải khai ra.
            Log.e(TAG, "không lấy được NotificationManager — chuông sẽ bị vứt im lặng")
            return
        }
        manager.deleteNotificationChannel(LEGACY_CHANNEL_ID)

        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) {
            // Người dùng tắt RIÊNG kênh này là ca hỏng khó tìm nhất: `areNotificationsEnabled()`
            // là cờ cấp APP nên vẫn `true`, `notify()` chạy trơn, hệ thống vứt im lặng. Android
            // cũng không cho code bật lại — chỉ khai ra được thôi.
            if (existing.importance == NotificationManager.IMPORTANCE_NONE) {
                Log.w(TAG, "kenh Cuoc goi den dang bi TAT trong Cai dat — khong co chuong")
            }
            return
        }

        val channel = NotificationChannel(CHANNEL_ID, "Cuộc gọi đến", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "Chuông khi có cuộc gọi thoại hoặc video"
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 1000, 1000)
        channel.lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        manager.createNotificationChannel(channel)
    }

    /**
     * Intent của FULL-SCREEN INTENT: mở thẳng `IncomingCallActivity`.
     *
     * Không dùng deep link ở đây — deep link giải ra `MainActivity`, thứ không khai
     * `showWhenLocked` nên bị keyguard che.
     */
    private fun lockScreenIntent(context: Context, extras: Bundle, callId: String): PendingIntent {
        val intent = Intent(context, IncomingCallActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(KEY_CALL_ID, callId)
        for (key in LAUNCH_KEYS) intent.putExtra(key, extras.getString(key).orEmpty())
        return PendingIntent.getActivity(
            context,
            notificationId(callId) + REQUEST_FULL_SCREEN,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Deep link vào app kèm ý định (mở / nghe / từ chối) — JS đọc bằng `expo-router`. */
    private fun deepLink(context: Context, action: String, callId: String, requestCode: Int): PendingIntent {
        val uri = Uri.parse("$SCHEME://call/$callId")
            .buildUpon()
            .appendQueryParameter("action", action)
            .build()
        val intent = Intent(Intent.ACTION_VIEW, uri)
            .setPackage(context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(
            context,
            // requestCode PHẢI khác nhau: cùng số + cùng Intent là Android tái dùng đúng một
            // PendingIntent, ba nút hoá ra cùng một hành động.
            notificationId(callId) + requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Hạn đổ chuông còn lại; thiếu/không đọc được ⇒ trần mặc định. */
    private fun timeoutMs(expiresAt: String?): Long {
        val remain = remainMs(expiresAt) ?: return RING_TIMEOUT_MS
        return remain.coerceIn(1_000L, RING_TIMEOUT_MS)
    }

    private fun isExpired(expiresAt: String?): Boolean = (remainMs(expiresAt) ?: 1L) <= 0L

    /**
     * ISO-8601 của BE (`2026-10-01T03:04:05.000Z`) — parse bằng `Instant`. Không parse được
     * ⇒ `null` = "không biết", nơi gọi tự chọn mặc định (không bao giờ nuốt chuông vì lỗi parse).
     */
    private fun remainMs(expiresAt: String?): Long? {
        if (expiresAt.isNullOrEmpty()) return null
        return try {
            java.time.Instant.parse(expiresAt).toEpochMilli() - System.currentTimeMillis()
        } catch (err: Exception) {
            null
        }
    }

    /**
     * App có đang ở tiền cảnh không — cùng cách RNFirebase tự kiểm. Không dùng được vòng đời
     * React Native ở đây vì receiver chạy cả khi JS chưa từng boot.
     */
    private fun isAppInForeground(context: Context): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            ?: return false
        val processes = manager.runningAppProcesses ?: return false
        return processes.any {
            it.processName == context.packageName &&
                it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        }
    }

    internal companion object {
        /** `internal` để `LockScreenCallModule` hạ được đúng notification này khi JS nhận tín hiệu qua socket. */
        internal fun notificationId(callId: String): Int = callId.hashCode()

        const val TAG = "CallPushReceiver"

        /** ⚠️ `with-android-call-notification.js` ghi đè giá trị này theo `scheme` của app config. */
        const val SCHEME = "superapp"

        /** ⚠️ Đổi âm/độ ưu tiên PHẢI đổi luôn id — Android khoá kênh đã tạo. */
        const val CHANNEL_ID = "superapp-call-ring-v1"

        /** Kênh `calls` do JS tạo ở bản trước (âm thông báo, không phải nhạc chuông) — dọn đi. */
        const val LEGACY_CHANNEL_ID = "calls"
        const val NOTIFICATION_TAG = "superapp-incoming-call"
        const val RING_TIMEOUT_MS = 60_000L

        /** requestCode của full-screen intent — phải khác 0..2 của 3 nút trên khay. */
        const val REQUEST_FULL_SCREEN = 3

        const val TYPE_PREFIX = "call."
        const val TYPE_RING = "call.incoming"
        const val MEDIA_VIDEO = "VIDEO"
        const val SCOPE_DIRECT = "DIRECT"
        const val DEFAULT_CALLER = "Super App"

        const val KEY_TYPE = "type"
        const val KEY_CALL_ID = "callId"
        const val KEY_CALL_UUID = "callUuid"
        const val KEY_CALLER_ID = "callerId"
        const val KEY_CALLER_NAME = "callerName"
        const val KEY_CALLER_AVATAR = "callerAvatar"
        const val KEY_SCOPE_TITLE = "scopeTitle"
        const val KEY_SCOPE_KIND = "scopeKind"
        const val KEY_MEDIA_KIND = "mediaKind"
        const val KEY_EXPIRES_AT = "expiresAt"
        const val KEY_TARGET_USER_ID = "targetUserId"

        /** Khoá chuyển tiếp sang `IncomingCallActivity` → JS đọc qua `getLaunchCall()`. */
        val LAUNCH_KEYS = listOf(
            KEY_CALL_UUID, KEY_CALLER_ID, KEY_CALLER_NAME, KEY_CALLER_AVATAR,
            KEY_SCOPE_TITLE, KEY_SCOPE_KIND, KEY_MEDIA_KIND, KEY_EXPIRES_AT,
        )

        const val ACTION_OPEN = "open"
        const val ACTION_ACCEPT = "accept"
        const val ACTION_DECLINE = "decline"
    }
}
