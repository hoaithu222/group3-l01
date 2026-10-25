/**
 * Khai báo cho tài nguyên KHÔNG phải mã nguồn.
 *
 * TypeScript 5.6 trở lên bật `noUncheckedSideEffectImports`, nên
 * `import '@/styles/global.css'` báo lỗi "Cannot find module or type
 * declarations for side-effect import". Bản thân import đó là ĐÚNG và cần
 * thiết — Metro dùng nó để đưa CSS của NativeWind vào bundle — chỉ là
 * TypeScript không biết `.css` là gì.
 *
 * ⛔ Đừng "chữa" bằng cách tắt `noUncheckedSideEffectImports`: cờ đó đang bắt
 * giúp một lỗi thật khác — import một module KHÔNG TỒN TẠI chỉ để lấy tác dụng
 * phụ, thứ mà trước đây lọt qua hoàn toàn im lặng.
 */
declare module '*.css';

/**
 * Tệp âm ngắn dùng chung (`assets/sounds/*.wav`, vd âm báo tin mới trong app — p1-07). Metro trả về một mã tài nguyên
 * (số) mà `expo-audio` (`createAudioPlayer`) nhận trực tiếp.
 */
declare module '*.wav' {
  const source: number;
  export default source;
}
