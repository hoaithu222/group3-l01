/**
 * Hai kho lưu trữ, KHÔNG được nhầm:
 *
 *   secure-storage — Keychain/Keystore, mã hoá bởi hệ điều hành. CHỈ cho token
 *                    và những thứ lộ ra là mất tài khoản.
 *   app-storage    — AsyncStorage, KHÔNG mã hoá. Cho dữ liệu thường.
 *
 * Xem bảng đầy đủ ở `core/config/auth.config.ts`.
 */
export { deleteSecure, readSecure, writeSecure } from './secure-storage';
export { createPersistStorage, readJson, removeKey, writeJson } from './app-storage';
export {
  isValidScopedUserId,
  readScoped,
  removeAllForUser,
  removeScoped,
  scopedKey,
  writeScoped,
} from './session-scoped-storage';
