import { WorkspaceActivityScreen } from '@/features/contribution';

/** Hoạt động theo ngày của CẢ NHÓM (gộp mọi bảng) — biểu đồ, chọn thành viên, danh sách theo ngày (p4-06). Chỉ đọc với mọi vai trò (khách bị BE chặn 404). */
export default function WorkspaceActivityRoute() {
  return <WorkspaceActivityScreen />;
}
