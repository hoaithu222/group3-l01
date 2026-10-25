import { Alert } from '@/shared/ui/alert';

export interface TeammatesPrivacyNoteProps {
  /** Công tắc "Hiện tên đồng đội" đang bật (kể cả CHƯA lưu) — đổi câu nói đúng hậu quả của trạng thái đang chọn. */
  enabled: boolean;
  teammatesCount: number;
  /**
   * Số tên thật sự hiện (chỉ đồng đội đã đồng ý), lấy từ `snapshot.namedTeammates` ĐÃ LƯU. `null` khi bản đã lưu đang TẮT — chưa có con số nào để nói
   * (snapshot chỉ tính lại tên đồng đội SAU khi lưu công tắc bật), nên không bịa "0/3".
   */
  namedCount: number | null;
}

/**
 * Ghi chú quyền riêng tư đồng đội (app.md p6-07 §3 "Sửa dự án"): nói rõ AI được nêu tên. Mặc định TẮT ⇒ chỉ có "Làm cùng N đồng đội". Bật ⇒ chỉ tên người ĐÃ đồng ý
 * (công tắc "Cho đồng đội hiện tên tôi trong portfolio của họ" ở Quyền riêng tư nghề nghiệp); người khác hiển thị là "Đồng đội" — BE lọc, app chỉ giải thích.
 */
export function TeammatesPrivacyNote({
  enabled,
  namedCount,
  teammatesCount,
}: TeammatesPrivacyNoteProps) {
  if (!enabled) {
    return (
      <Alert
        description={`Trang chỉ ghi "Làm cùng ${teammatesCount} đồng đội", không nêu tên ai.`}
        tone="info"
      />
    );
  }
  const count =
    namedCount === null
      ? ' Số người được nêu tên sẽ hiện sau khi bạn lưu.'
      : ` Hiện có ${namedCount}/${teammatesCount} người được nêu tên.`;
  return (
    <Alert
      description={`Chỉ hiện tên người đã đồng ý; người khác hiển thị là "Đồng đội".${count}`}
      tone="info"
    />
  );
}
