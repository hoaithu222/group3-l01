import { useWorkspaceOverview } from '../queries/workspaces.queries';

export interface GuestAccess {
  /** Hạn của CHÍNH MÌNH khi là khách; `null` khi không phải khách hoặc BE chưa gửi. */
  expiresAt: string | null;
  isGuest: boolean;
  isLoading: boolean;
}

/**
 * Mình có phải KHÁCH của nhóm này không (app.md p3-04 §2/§5) — đọc `myRole` mà BE trả,
 * KHÔNG tự suy từ nguồn nào khác. Dùng chung cache `overview` với hub nhóm nên không thêm
 * request nào khi hub đã tải.
 *
 * Chỉ để ẩn/khoá điểm vào cho gọn (Thành viên, Việc, Tài liệu, Học, Tạo kênh, Mời —
 * be.md §5.6); quyền thật do BE quyết (khách gọi thẳng các điểm đó vẫn nhận 404).
 * Chưa tải xong thì `isGuest = false` — không giấu nhầm mục của thành viên thường, và
 * khách thì BE chặn thật nếu bấm.
 */
export function useGuestAccess(wsId: string | undefined): GuestAccess {
  const { data, isLoading } = useWorkspaceOverview(wsId);
  const isGuest = data?.workspace.myRole === 'GUEST';
  return { expiresAt: isGuest ? (data?.workspace.myExpiresAt ?? null) : null, isGuest, isLoading };
}

export function useIsGuest(wsId: string | undefined): boolean {
  return useGuestAccess(wsId).isGuest;
}
