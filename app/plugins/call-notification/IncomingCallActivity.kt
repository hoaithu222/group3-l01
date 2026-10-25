package com.mancode.vungnui

import android.content.Intent
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

import java.lang.ref.WeakReference

/**
 * Màn hình CUỘC GỌI ĐẾN hiện được **trên màn khoá**.
 *
 * ## Vì sao phải là một Activity riêng
 *
 * Full-screen intent chỉ bung ra được khi Activity đích khai `showWhenLocked`;
 * `MainActivity` không khai (và KHÔNG được khai — cả app sẽ hiện qua màn khoá với mọi lối
 * vào khác, kể cả thông báo chat ⇒ lỗ bảo mật thật). Nên tách một Activity chỉ dùng cho
 * cuộc gọi, khai `showWhenLocked` + `turnScreenOn` trong manifest (xem
 * `plugins/with-android-call-notification.js`).
 *
 * ## Vì sao vẫn là ReactActivity
 *
 * Nghe / Từ chối phải gọi `POST /calls/:id/answer|decline` kèm `Authorization` — token nằm
 * trong bộ nhớ JS (và refresh token trong SecureStore), native không với tới. Host một root
 * RN ngay tại đây thì hai nút đó chạy bằng chính `call-actions.ts` sẵn có.
 *
 * ⚠️ Root component là **"IncomingCall"**, KHÔNG phải "main": `expo-router` chỉ được phép có
 * một cây điều hướng trong một JS runtime. Xem `src/shell/lock-screen/IncomingCallRoot.tsx`.
 *
 * ℹ️ `MainApplication.reactHost` là `by lazy` ⇒ **một thực thể duy nhất**, nên Activity này
 * dùng CHUNG JS runtime với `MainActivity`: cùng zustand store, cùng React Query cache.
 */
class IncomingCallActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Phải đặt TRƯỚC khi cửa sổ hiện. `minSdk` của dự án ≥ 24 nhưng hai API này là 27+;
        // dưới mức đó Android không có màn khoá kiểu mới nên bỏ qua là đúng.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        LockScreenCallState.launchCall = intent?.extras
        current = WeakReference(this)

        super.onCreate(null)
    }

    /**
     * `launchMode="singleTask"` ⇒ chuông thứ hai quay lại chính instance này chứ không dựng
     * cái mới. Phải cập nhật lại dữ liệu, nếu không JS đọc `getLaunchCall()` vẫn ra cuộc cũ.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        LockScreenCallState.launchCall = intent.extras
        LockScreenCallState.emitSignal(SIGNAL_RELAUNCH, intent.getStringExtra(EXTRA_CALL_ID).orEmpty())
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        super.onDestroy()
    }

    /**
     * Back KHÔNG đóng màn gọi.
     *
     * Đóng bằng Back giữa cuộc gọi là bỏ lại `callStore` ở trạng thái `active` mà không còn UI
     * nào cầm — cuộc gọi thành mồ côi (vẫn tính phút, không ai tắt được). Màn gọi chỉ đóng qua
     * `LockScreenCall.dismiss()` (JS quyết) hoặc `finishFor` (native, khi chưa nhận).
     */
    override fun invokeDefaultOnBackPressed() = Unit

    override fun getMainComponentName(): String = COMPONENT_NAME

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
        )

    companion object {
        const val COMPONENT_NAME = "IncomingCall"
        const val EXTRA_CALL_ID = "callId"
        const val SIGNAL_RELAUNCH = "call.relaunch"

        private var current: WeakReference<IncomingCallActivity>? = null

        /**
         * Đóng màn gọi.
         *
         * @param callId chỉ đóng nếu đang hiện đúng cuộc này (`null` = đóng bất kể).
         * @param force bỏ qua cờ `holdActive`. Chỉ JS được `force` (qua `LockScreenCall.dismiss()`),
         *   vì chỉ JS biết cuộc gọi đã thực sự xong chưa.
         *
         * ⛔ Không có `holdActive` thì push `call.answered-elsewhere` — **echo của chính máy này
         * vừa bấm Nghe** — sẽ đóng luôn màn hình đang nói dở.
         */
        fun finishFor(callId: String?, force: Boolean = false) {
            if (!force && LockScreenCallState.holdActive) return
            val activity = current?.get() ?: return
            if (!callId.isNullOrEmpty()) {
                val showing = activity.intent?.getStringExtra(EXTRA_CALL_ID)
                if (!showing.isNullOrEmpty() && showing != callId) return
            }
            activity.runOnUiThread {
                if (!activity.isFinishing) activity.finishAndRemoveTask()
            }
        }
    }
}
