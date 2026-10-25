/**
 * Cổng ĐỌC điểm đóng góp cho module Phase 6 (p6-07 portfolio, p6-08 recruiter board) — đặt ở `shared/ports/` để chúng KHÔNG import
 * `modules/contribution` (luật 3 tầng). Cài đặt: `createContributionReadPort()` ở `@modules/contribution/public`. Chỉ đọc; số liệu lấy từ SNAPSHOT `ALL`
 * (công thức D-09, công khai cạnh từng %), KHÔNG lộ dữ liệu theo từng bảng/thẻ.
 *
 * `…X10` = giá trị × 10 làm tròn (91,0 → 910) — cùng quy ước `contributionPctX10` của p6-07/p6-08. "Điểm" là thang 0–100 của công thức (làm tốt tới đâu),
 * KHÔNG phải % chiếm nhóm: % chiếm nhóm phụ thuộc quy mô nhóm nên không so sánh được giữa các nhóm.
 */
export interface ContributionMemberScore {
  /** Trung bình cộng điểm `ALL` của các bảng trong nhóm mà người này có ≥ 1 thẻ hoàn thành. */
  scoreX10: number;
  /** Trung bình cộng % chiếm nhóm (`share`) của các bảng đó. */
  shareX10: number;
  /** Số bảng được tính. */
  boards: number;
}

export interface ContributionCareerScore {
  /** Trung bình các nhóm (mỗi nhóm = `scoreX10` của nhóm đó) — công thức hiển thị kèm số nhóm được tính. */
  pctX10: number;
  /** Số nhóm (workspace) có ≥ 1 bảng đủ dữ liệu. */
  workspaces: number;
}

export interface ContributionReadPort {
  /** `null` khi người này chưa có thẻ hoàn thành nào trong nhóm. */
  memberScore(workspaceId: string, userId: string): Promise<ContributionMemberScore | null>;
  /** `null` khi chưa có nhóm nào đủ dữ liệu (< 1 nhóm). */
  careerScore(userId: string): Promise<ContributionCareerScore | null>;
}
