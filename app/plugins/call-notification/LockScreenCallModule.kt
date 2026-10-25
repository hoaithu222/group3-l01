package com.mancode.vungnui

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Cầu nối JS ↔ chuông/màn gọi native. Bọc phía JS: `src/features/calls/native/lock-screen-call.ts`.
 *
 * Module kiểu cũ (`ReactContextBaseJavaModule`) chạy qua **TurboModule interop**. ⛔ Mỗi method
 * một tên DUY NHẤT: interop cấm trùng tên — đó chính là thứ làm `react-native-callkeep` chết
 * trên RN 0.86 (xem `app.config.ts`).
 */
class LockScreenCallModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        LockScreenCallState.emitter = { type, callId -> emitSignal(type, callId) }
    }

    override fun invalidate() {
        LockScreenCallState.emitter = null
        // JS đi ngủ thì không còn "UI cuộc gọi sẵn sàng" nữa — để cờ treo `true` là receiver im
        // luôn cho mọi cuộc gọi sau đó.
        LockScreenCallState.callUiReady = false
        stopRingtoneInternal()
        super.invalidate()
    }

    private fun emitSignal(type: String, callId: String) {
        try {
            val payload = Arguments.createMap().apply {
                putString("type", type)
                putString("callId", callId)
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_SIGNAL, payload)
        } catch (err: Exception) {
            // JS chưa sẵn sàng (đang boot / vừa teardown) — mất tín hiệu ở đây không sao:
            // `GET /calls/:id` lúc dựng lại sẽ nói cuộc gọi còn sống hay không.
            Log.w(NAME, "không phát được tín hiệu cuộc gọi sang JS", err)
        }
    }

    /** Dữ liệu cuộc gọi mà `IncomingCallActivity` được mở kèm. `null` = mở suông. */
    @ReactMethod
    fun getLaunchCall(promise: Promise) {
        val extras = LockScreenCallState.launchCall
        if (extras == null) {
            promise.resolve(null)
            return
        }
        promise.resolve(
            Arguments.createMap().apply {
                putString("callId", extras.getString(CallPushReceiver.KEY_CALL_ID).orEmpty())
                putString("callUuid", extras.getString(CallPushReceiver.KEY_CALL_UUID).orEmpty())
                putString("callerId", extras.getString(CallPushReceiver.KEY_CALLER_ID).orEmpty())
                putString("callerName", extras.getString(CallPushReceiver.KEY_CALLER_NAME).orEmpty())
                putString("callerAvatar", extras.getString(CallPushReceiver.KEY_CALLER_AVATAR).orEmpty())
                putString("scopeTitle", extras.getString(CallPushReceiver.KEY_SCOPE_TITLE).orEmpty())
                putString("scopeKind", extras.getString(CallPushReceiver.KEY_SCOPE_KIND).orEmpty())
                putString("mediaKind", extras.getString(CallPushReceiver.KEY_MEDIA_KIND).orEmpty())
            },
        )
    }

    /**
     * Cuộc gọi ĐÃ TÀN → hạ chuông + đóng màn.
     *
     * Hạ LUÔN notification — nó là nguồn phát nhạc chuông hệ thống, đóng mỗi Activity thì máy
     * vẫn kêu. Trước đây chỉ `CallPushReceiver` hạ được, tức phải đợi một gói FCM `call.*` khác;
     * tín hiệu socket (nhanh hơn, và vẫn tới cả khi FCM bị hoãn) không có đường nào chạm vào
     * chuông — đó là lý do thiết bị thứ hai còn reo sau khi thiết bị kia đã bắt máy.
     *
     * ⛔ Luôn truyền `callId`: thiếu nó thì một tín hiệu TRỄ của cuộc CŨ sẽ hạ chuông của cuộc
     * ĐANG reo, hoặc trong gọi nhóm người khác bấm Từ chối là chuông máy mình tắt theo.
     */
    @ReactMethod
    fun dismiss(callId: String?) {
        stopRinging(callId)
        // Hai cờ này thuộc về "cuộc gọi đã xong", KHÔNG thuộc về "thôi reo": nhả `holdActive`
        // trong `stopRinging` là mở cửa cho gói FCM kế tiếp đóng màn đang nói dở.
        LockScreenCallState.launchCall = null
        LockScreenCallState.holdActive = false
        IncomingCallActivity.finishFor(callId, force = true)
    }

    /**
     * Thôi ĐỔ CHUÔNG nhưng **GIỮ màn gọi đang mở**.
     *
     * Dùng khi người dùng bấm Nghe ngay trên màn khoá: chuông phải tắt, nhưng `dismiss()` thì
     * đóng luôn Activity — tức giết đúng cuộc gọi vừa nhận. Trước khi tách hàm này, cây `main`
     * (vẫn sống khi app chạy nền) gọi `dismiss()` lúc pha đổi sang `connecting` và đóng mất màn
     * mà người dùng đang nói.
     */
    @ReactMethod
    fun stopRinging(callId: String?) {
        stopRingtoneInternal()
        val ringing = LockScreenCallState.ringingCallId

        // Đối chiếu id để một tín hiệu TRỄ của cuộc CŨ không hạ chuông của cuộc ĐANG reo.
        val ringMatches = callId == null || ringing == null || ringing == callId
        if (ringMatches) {
            // Ưu tiên id ĐƯỢC YÊU CẦU: `LockScreenCallState` chết theo tiến trình còn notification
            // thì sống sót qua process death — sau khi hệ thống giết app, `ringingCallId` về `null`
            // trong khi chuông vẫn treo trên khay.
            val target = callId ?: ringing
            if (target != null) {
                LockScreenCallState.nativeRingActive = false
                if (ringing == target) LockScreenCallState.ringingCallId = null
                try {
                    NotificationManagerCompat.from(reactApplicationContext).cancel(
                        CallPushReceiver.NOTIFICATION_TAG,
                        CallPushReceiver.notificationId(target),
                    )
                } catch (err: Exception) {
                    Log.w(NAME, "không hạ được chuông native", err)
                }
            }
        } else {
            Log.w(NAME, "giữ chuông $ringing: yêu cầu hạ chuông $callId là của cuộc khác")
        }
    }

    /**
     * Đóng màn gọi mà **GIỮ NGUYÊN notification** — dùng khi JS *không dựng lại được* UI, chứ
     * không phải khi cuộc gọi đã tàn. Hai thứ đó khác nhau: `GET /calls/:id` lỗi MẠNG cũng trả
     * "không còn sống", token chưa khôi phục xong cũng vậy. Gộp vào `dismiss()` thì máy đang khoá
     * + mạng chập là chuông biến mất khỏi khay, người dùng không còn gì để bấm.
     */
    @ReactMethod
    fun closeScreen() {
        LockScreenCallState.launchCall = null
        LockScreenCallState.holdActive = false
        IncomingCallActivity.finishFor(null, force = true)
    }

    /** JS báo "trong app đang có đường hiện cuộc gọi" — xem `LockScreenCallState.callUiReady`. */
    @ReactMethod
    fun setCallUiReady(ready: Boolean) {
        LockScreenCallState.callUiReady = ready
    }

    /** Bật khi JS đã nhận cuộc — chặn native tự đóng màn đang nói dở. */
    @ReactMethod
    fun setHoldActive(active: Boolean) {
        LockScreenCallState.holdActive = active
    }

    /**
     * Bật foreground service giữ micro/camera sống khi app ra nền — xem `CallForegroundService`.
     * `withCamera` phải phản ánh camera đang THẬT SỰ bật: khai thừa kiểu `camera` khi chưa có
     * quyền là `SecurityException` ngay lúc `startForeground`.
     */
    @ReactMethod
    fun startCallService(title: String?, withCamera: Boolean) {
        CallForegroundService.start(reactApplicationContext, title.orEmpty().ifEmpty { "Cuộc gọi" }, withCamera)
    }

    @ReactMethod
    fun stopCallService() {
        CallForegroundService.stop(reactApplicationContext)
    }

    /** `userId` đang đăng nhập (ghi xuống SharedPreferences) — receiver dùng để bỏ push nhầm chủ máy. */
    @ReactMethod
    fun setCurrentUser(userId: String?) {
        LockScreenCallState.setCurrentUserId(reactApplicationContext, userId)
    }

    /** Notification cuộc gọi có đang đổ chuông hệ thống không — JS dùng để không reo chồng. */
    @ReactMethod
    fun isNativeRingActive(promise: Promise) {
        promise.resolve(LockScreenCallState.nativeRingActive)
    }

    /**
     * Quyền "Thông báo toàn màn hình" (Android 14+). Trả **chuỗi** `"granted"`/`"denied"`, không
     * phải boolean: phía JS còn trạng thái thứ ba `"unknown"` (bản build chưa link module này) và
     * quy "không dò được" = đã cấp thì đúng ca cần mời nhất lại không bao giờ mời.
     */
    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            promise.resolve(STATUS_GRANTED)
            return
        }
        val manager = reactApplicationContext.getSystemService(NotificationManager::class.java)
        promise.resolve(if (manager?.canUseFullScreenIntent() == true) STATUS_GRANTED else STATUS_DENIED)
    }

    /**
     * Chuông + rung khi app ĐANG MỞ (native đã bỏ qua notification ở ca này, xem
     * `CallPushReceiver`). Dùng nhạc chuông hệ thống chứ không phải file trong `assets/`: dự án
     * chưa có tài sản âm thanh nào, mà tiếng "ting" thông báo thì không ai nhận ra là cuộc gọi.
     */
    @ReactMethod
    fun startRingtone() {
        try {
            stopRingtoneInternal()
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                ?: return
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(reactApplicationContext, uri)
                isLooping = true
                prepare()
                start()
            }
            vibrator()?.let { vib ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, 0))
                } else {
                    @Suppress("DEPRECATION")
                    vib.vibrate(VIBRATE_PATTERN, 0)
                }
            }
        } catch (err: Exception) {
            // Chuông là phụ trợ: im lặng còn hơn kéo sập cuộc gọi.
            Log.w(NAME, "không phát được chuông trong app", err)
            stopRingtoneInternal()
        }
    }

    @ReactMethod
    fun stopRingtone() = stopRingtoneInternal()

    private fun stopRingtoneInternal() {
        try {
            player?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
        } catch (err: Exception) {
            Log.w(NAME, "không dừng được chuông", err)
        }
        player = null
        try {
            vibrator()?.cancel()
        } catch (err: Exception) {
            Log.w(NAME, "không dừng được rung", err)
        }
    }

    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (reactApplicationContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                ?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            reactApplicationContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    /** Bắt buộc có để `DeviceEventEmitter` không cảnh báo trên kiến trúc mới. */
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    companion object {
        const val NAME = "LockScreenCall"
        const val EVENT_SIGNAL = "LockScreenCall.signal"
        const val STATUS_GRANTED = "granted"
        const val STATUS_DENIED = "denied"

        /** Nghỉ 1 s — rung 1 s, lặp (chỉ số lặp 0 = quay lại đầu mảng). */
        private val VIBRATE_PATTERN = longArrayOf(0, 1000, 1000)

        /** Một tiến trình chỉ có một cuộc gọi ⇒ một player, để `static` cho mọi instance dừng được. */
        @Volatile
        private var player: MediaPlayer? = null
    }
}
