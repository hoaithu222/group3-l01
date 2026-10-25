export { Alert } from './Alert';
export type { AlertProps } from './Alert';

// ⚠️ `AlertTone` sống ở `alert.styles.ts` chứ không ở `Alert.tsx`: `AlertIcon`
// cần kiểu này, mà `Alert` lại nhập `AlertIcon` — để kiểu ở `Alert.tsx` là tạo
// vòng nhập (`import/no-cycle` báo lỗi). Tên xuất ra ngoài KHÔNG đổi.
export type { AlertTone } from './alert.styles';
