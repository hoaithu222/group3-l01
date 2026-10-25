import { ScanInviteScreen } from '@/features/members/screens/ScanInviteScreen';

/**
 * Quét QR của link mời — mở từ `join.tsx`. ⚠️ Module native `expo-camera` được nạp ĐỘNG bên trong màn (không import ở
 * đây, không import ở đầu file nào được nạp lúc khởi động): dev client dựng trước khi có `ExpoCamera` vẫn mở được app.
 */
export default function ScanInviteRoute() {
  return <ScanInviteScreen />;
}
