import { JoinByCodeScreen } from '@/features/members/screens/JoinByCodeScreen';

/**
 * "Tham gia nhóm" — dán link/nhập mã mời (hoặc sang màn quét QR). Cùng cấp `new.tsx`/`invitations.tsx`, NGOÀI `[wsId]/`:
 * chưa vào nhóm thì chưa có `wsId` để đứng dưới `[wsId]/_layout.tsx`. Mở từ màn Nhóm (nút AppBar và trạng thái rỗng).
 */
export default function JoinByCodeRoute() {
  return <JoinByCodeScreen />;
}
