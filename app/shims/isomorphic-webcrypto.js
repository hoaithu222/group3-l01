/**
 * Bản thay thế `isomorphic-webcrypto/src/react-native` — CHỈ để `yjs` chạy được trên React Native.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * `yjs` → `lib0/random` → `lib0/webcrypto`. Trong `package.json` của `lib0`, điều kiện export `"react-native"` của `./webcrypto` trỏ tới
 * `dist/webcrypto.react-native.cjs`, file này `require('isomorphic-webcrypto/src/react-native')` — một gói `lib0` chỉ khai là
 * peer "tuỳ chọn" và KHÔNG cài kèm. Metro (và bộ phân giải của Jest, cùng dùng điều kiện `react-native`) chọn đúng nhánh đó nên
 * mọi thứ nạp `yjs` đều chết:
 *
 *   Unable to resolve module isomorphic-webcrypto/src/react-native from …/lib0/dist/webcrypto.react-native.cjs
 *
 * Đã đo bằng `expo export --platform android` trên một entry chỉ `import * as Y from 'yjs'`. Cài `isomorphic-webcrypto` thật thì kéo theo
 * một chuỗi gói cũ (`@peculiar/webcrypto`, `asmcrypto.js`, `react-native-securerandom`…) chỉ để có `getRandomValues` — ta đã có
 * `expo-crypto`. Nên thay bằng tệp này, nối vào `metro.config.js` (`resolver.resolveRequest`) và `jest.config.js` (`moduleNameMapper`).
 *
 * ── Hợp đồng (đúng cái `lib0` dùng) ─────────────────────────────────────────
 * `lib0` chỉ đọc `subtle`, `getRandomValues` (gắn `this`) và gọi `ensureSecure()`; `yjs` chỉ cần `getRandomValues` (sinh `clientID` 32-bit khi
 * tạo `Y.Doc`). `subtle` để `undefined`: `lib0/crypto` (băm/khoá) không được `yjs`, `y-protocols` hay `@hocuspocus/provider` gọi.
 *
 * ⚠️ Ưu tiên `globalThis.crypto` nếu có (Node/Jest, Hermes đời sau) rồi mới tới `expo-crypto` (module native — nạp LƯỜI để test không đụng nó).
 */

/** @type {(array: ArrayBufferView) => ArrayBufferView} */
function getRandomValues(array) {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    return webCrypto.getRandomValues(array);
  }
  return require('expo-crypto').getRandomValues(array);
}

module.exports = {
  subtle: undefined,
  getRandomValues,
  ensureSecure: () => Promise.resolve(),
};
