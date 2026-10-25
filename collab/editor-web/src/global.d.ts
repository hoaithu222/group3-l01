import type { SuperAppEditorGlobal } from "./transport";

declare global {
  interface Window {
    /** Do `react-native-webview` chèn vào trang. */
    ReactNativeWebView?: { postMessage(data: string): void };
    /** Điểm vào cho `injectJavaScript` của app + vết tin đã gửi. */
    __superAppEditor?: SuperAppEditorGlobal;
  }
}

export {};
