package com.mancode.vungnui

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Đăng ký `LockScreenCallModule`. Được chèn vào `MainApplication` bởi
 * `plugins/with-android-call-notification.js` — `android/` là CNG (sinh lại mỗi lần
 * `expo prebuild`) nên KHÔNG sửa tay.
 *
 * Khai **cả hai** lối lấy module: `getModule` (đường của kiến trúc mới) và
 * `createNativeModules` (đường cũ, TurboModule interop vẫn duyệt qua). Thiếu một trong hai
 * thì tuỳ cấu hình build mà `NativeModules.LockScreenCall` ra `undefined` — mà phía JS đã
 * no-op khi thiếu nên lỗi sẽ IM LẶNG: màn gọi không bao giờ đóng.
 */
class LockScreenCallPackage : ReactPackage {

    // `createNativeModules` bị RN đánh dấu deprecated (khuyến khích `BaseReactPackage`), nhưng
    // TurboModule interop trong app này VẪN đi qua nó — xem KDoc trên class.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(LockScreenCallModule(reactContext))

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == LockScreenCallModule.NAME) LockScreenCallModule(reactContext) else null

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
