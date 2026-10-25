package com.mancode.vungnui

import android.content.Context
import android.os.Bundle

/**
 * Trạng thái dùng chung giữa `CallPushReceiver` (chạy cả khi JS chưa boot),
 * `IncomingCallActivity` và `LockScreenCallModule` (cầu sang JS).
 *
 * Cố ý là `object` tĩnh, phạm vi TIẾN TRÌNH: receiver có thể chạy khi chưa có
 * ReactContext nào, nên không thể để state trong native module.
 *
 * `@Volatile` vì receiver chạy ở luồng broadcast, Activity ở luồng UI, còn
 * `LockScreenCallModule` ở luồng JS/native modules.
 */
internal object LockScreenCallState {

    /** Notification cuộc gọi đang đổ chuông hệ thống hay không. */
    @Volatile
    var nativeRingActive: Boolean = false

    /**
     * `callId` của notification đang treo — để JS hạ được chuông native.
     *
     * ⛔ Không suy ra từ `launchCall` được: bản ghi đó chỉ có khi màn gọi toàn màn hình
     * đã bung. Máy đang MỞ khoá thì hệ thống hạ full-screen intent xuống heads-up,
     * `launchCall` rỗng mà chuông vẫn kêu.
     */
    @Volatile
    var ringingCallId: String? = null

    /**
     * JS đã "cầm" cuộc gọi (bấm Nghe) ⇒ native KHÔNG được tự đóng màn gọi nữa.
     * Xem `IncomingCallActivity.finishFor`.
     */
    @Volatile
    var holdActive: Boolean = false

    /** Extras của cuộc gọi đang hiện — JS đọc qua `LockScreenCall.getLaunchCall()`. */
    @Volatile
    var launchCall: Bundle? = null

    /**
     * App đang mở VÀ thực sự dựng được UI cuộc gọi trong app hay không.
     *
     * ⛔ Không suy ra từ "app ở tiền cảnh" được: chưa đăng nhập, JS còn đang boot, hoặc
     * bản dựng thiếu WebRTC thì `CallHost` không mount — native im mà app cũng không hiện
     * gì ⇒ mất trắng cuộc gọi. `CallHost` (surface `main`) bật/tắt cờ này theo vòng đời
     * của chính nó.
     */
    @Volatile
    var callUiReady: Boolean = false

    /** Do `LockScreenCallModule` gắn vào khi có ReactContext; `null` = JS chưa sống. */
    @Volatile
    var emitter: ((String, String) -> Unit)? = null

    fun emitSignal(type: String, callId: String) {
        emitter?.invoke(type, callId)
    }

    /**
     * `userId` đang đăng nhập, ghi xuống `SharedPreferences` chứ không chỉ để trong RAM:
     * receiver chạy cả khi tiến trình vừa được đánh thức từ cõi chết, lúc đó mọi biến tĩnh
     * đều về mặc định. Thiếu nó thì máy ĐÃ ĐỔI CHỦ vẫn đổ chuông cho tài khoản cũ (push
     * tới bằng token FCM chưa kịp thu hồi).
     *
     * `null`/rỗng = chưa đăng nhập hoặc không rõ ⇒ receiver KHÔNG chặn (thà reo thừa một
     * lần còn hơn nuốt chuông của đúng chủ máy).
     */
    fun currentUserId(context: Context): String? =
        prefs(context).getString(KEY_USER_ID, null)?.ifEmpty { null }

    fun setCurrentUserId(context: Context, userId: String?) {
        prefs(context).edit().apply {
            if (userId.isNullOrEmpty()) remove(KEY_USER_ID) else putString(KEY_USER_ID, userId)
        }.apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Dọn TOÀN BỘ trạng thái cuộc gọi.
     *
     * ⛔ PHẢI gồm cả `callUiReady`: cờ đó nói "JS đang có đường hiện cuộc gọi"; treo `true`
     * khi JS đã chết là receiver im luôn cho MỌI cuộc gọi sau — mất chuông toàn tập.
     */
    fun clear() {
        nativeRingActive = false
        holdActive = false
        launchCall = null
        ringingCallId = null
        callUiReady = false
    }

    private const val PREFS = "superapp.lock-screen-call"
    private const val KEY_USER_ID = "currentUserId"
}
