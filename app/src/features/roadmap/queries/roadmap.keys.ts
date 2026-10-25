/** Khoá React Query của `roadmap` (app.md p4-07 §4) — GIỮ ĐÚNG hình dạng đã chốt, đừng thêm tham số vào khoá thô. */
export const roadmapKeys = {
  all: ['roadmap'] as const,
  subjects: ['roadmap', 'subjects'] as const,
  subject: (id: string) => ['roadmap', 'subject', id] as const,
  /**
   * TIỀN TỐ của mọi `subject(idOrSlug)` — không phải khoá của một truy vấn nào.
   *
   * ⚠️ Cùng một môn có thể nằm trong cache dưới HAI khoá: mở từ thẻ môn bằng SLUG (`subject('fullstack')`), mở từ thẻ
   * "Hôm nay" bằng ID. Làm mới/vá theo `subject(subject.id)` thì bản mở bằng slug (chính màn đang hiện) đứng im — đăng
   * ký xong vẫn thấy nút "Bắt đầu lộ trình", hoàn thành buổi xong quay lại vẫn chưa có dấu ✓. Luôn đi qua tiền tố này
   * rồi lọc theo `data.id`.
   */
  subjectDetails: ['roadmap', 'subject'] as const,
  lesson: (id: string) => ['roadmap', 'lesson', id] as const,
  media: (id: string) => ['roadmap', 'media', id] as const,
  today: ['roadmap', 'today'] as const,
};
