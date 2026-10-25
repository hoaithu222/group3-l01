import "./polyfills";
import "./style.css";
import { EditorController } from "./controller";
import { createWebViewTransport } from "./transport";

const root = document.getElementById("editor-root");
if (!root) throw new Error("Thiếu #editor-root");

const controller = new EditorController({ transport: createWebViewTransport(window), root });

// WebView không có console cho app: lỗi không bắt được được báo qua bridge (`error LOAD_FAILED`, không nghiêm trọng, có giới hạn tần suất).
window.addEventListener("error", (event) => controller.reportUnexpected(String(event.message)));
window.addEventListener("unhandledrejection", (event) => controller.reportUnexpected(String((event.reason as Error | undefined)?.message ?? event.reason)));

controller.start();
