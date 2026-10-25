/**
 * Kế hoạch ôn tập ngắt quãng (SR) và thi thử của 13 người trên các bộ học đã seed (nhận diện bằng tag `seed-rich:<slug>`).
 * Mỗi mục `sets` là một cặp (người, bộ): có `enroll` thì ghi danh ôn tập và mô phỏng nhật ký ôn nhiều ngày theo SM-2 thật của backend;
 * không `enroll` thì chỉ làm thi thử (câu sai tự vào hàng ôn dạng `MOCK_WRONG`). Chỉ dùng bộ mà người đó đọc được (thành viên nhóm hoặc bộ PUBLIC).
 */
export interface MockPlan {
  /** Làm bài cách đây bao nhiêu ngày. */
  daysAgo: number;
  /** Số câu muốn thi (kẹp theo số câu chấm được của bộ). */
  count: number;
  durationMin: number;
  passPct: number;
  /** Xác suất trả lời đúng mỗi câu (0..1). */
  skill: number;
  /** Hết giờ chưa nộp → hệ thống tự nộp (`EXPIRED`/`AUTO`), phần cuối đề bỏ trống. */
  auto?: boolean;
  /** Số lần rời app trong lúc thi. */
  backgrounds?: number;
}

export interface SetPlan {
  /** Khoá nhóm làm việc chứa bộ (`WorkspaceSpec.key`) và slug bộ trong nội dung seed. */
  ws: string;
  slug: string;
  enroll: boolean;
  /** Ghi danh ôn tập cách đây bao nhiêu ngày. */
  startDaysAgo: number;
  newPerDay: number;
  /** Xác suất nhớ đúng khi ôn (0..1) — quyết định tỉ lệ nút Lại/Khó/Tốt/Dễ. */
  recall: number;
  /** Xác suất có ôn trong một ngày bất kỳ (ngày ghi danh luôn có). */
  activeRate: number;
  /** Hôm nay: `none` = chưa ôn gì (còn thẻ đến hạn), `partial` = đã ôn một phần. */
  today: "none" | "partial";
  mocks?: MockPlan[];
}

export interface StudyPlan {
  key: string;
  sets: SetPlan[];
}

export const STUDY_PLANS: readonly StudyPlan[] = [
  {
    key: "thu",
    sets: [
      { ws: "frontend", slug: "frontend-react-hooks", enroll: true, startDaysAgo: 12, newPerDay: 8, recall: 0.78, activeRate: 0.85, today: "none", mocks: [{ daysAgo: 4, count: 10, durationMin: 12, passPct: 60, skill: 0.8, backgrounds: 1 }] },
      { ws: "ielts", slug: "ielts-academic-vocabulary", enroll: true, startDaysAgo: 10, newPerDay: 8, recall: 0.72, activeRate: 0.8, today: "partial" },
      { ws: "dsa", slug: "dsa-bigo-sorting", enroll: false, startDaysAgo: 0, newPerDay: 10, recall: 0.7, activeRate: 0.8, today: "none", mocks: [{ daysAgo: 2, count: 10, durationMin: 10, passPct: 60, skill: 0.6 }] },
    ],
  },
  {
    key: "minhanh",
    sets: [
      { ws: "frontend", slug: "frontend-javascript-es6", enroll: true, startDaysAgo: 13, newPerDay: 10, recall: 0.86, activeRate: 0.9, today: "partial" },
      { ws: "backend", slug: "backend-http-rest", enroll: true, startDaysAgo: 11, newPerDay: 8, recall: 0.74, activeRate: 0.75, today: "none" },
    ],
  },
  {
    key: "ducanh",
    sets: [
      { ws: "frontend", slug: "frontend-html-css", enroll: true, startDaysAgo: 14, newPerDay: 6, recall: 0.6, activeRate: 0.75, today: "none", mocks: [{ daysAgo: 5, count: 10, durationMin: 10, passPct: 60, skill: 0.5, backgrounds: 2 }] },
      { ws: "frontend", slug: "frontend-javascript-es6", enroll: true, startDaysAgo: 10, newPerDay: 6, recall: 0.55, activeRate: 0.7, today: "none" },
    ],
  },
  {
    key: "baochau",
    sets: [
      { ws: "frontend", slug: "frontend-html-css", enroll: true, startDaysAgo: 12, newPerDay: 5, recall: 0.52, activeRate: 0.65, today: "none" },
      { ws: "ielts", slug: "ielts-academic-vocabulary", enroll: true, startDaysAgo: 9, newPerDay: 6, recall: 0.58, activeRate: 0.6, today: "none" },
    ],
  },
  {
    key: "khanhlinh",
    sets: [
      { ws: "ielts", slug: "ielts-academic-vocabulary", enroll: true, startDaysAgo: 13, newPerDay: 10, recall: 0.85, activeRate: 0.95, today: "partial" },
      { ws: "ielts", slug: "ielts-collocations-linking", enroll: true, startDaysAgo: 11, newPerDay: 8, recall: 0.8, activeRate: 0.9, today: "none" },
      { ws: "uiux", slug: "uiux-nguyen-ly-thiet-ke", enroll: true, startDaysAgo: 9, newPerDay: 8, recall: 0.82, activeRate: 0.85, today: "none" },
    ],
  },
  {
    key: "anhthu",
    sets: [
      { ws: "ielts", slug: "ielts-academic-vocabulary", enroll: true, startDaysAgo: 14, newPerDay: 10, recall: 0.82, activeRate: 0.9, today: "partial", mocks: [{ daysAgo: 6, count: 10, durationMin: 12, passPct: 60, skill: 0.75 }, { daysAgo: 1, count: 10, durationMin: 12, passPct: 60, skill: 0.85 }] },
      { ws: "ielts", slug: "ielts-writing-task2-structure", enroll: true, startDaysAgo: 10, newPerDay: 6, recall: 0.78, activeRate: 0.8, today: "none" },
    ],
  },
  {
    key: "quynhnhu",
    sets: [{ ws: "ielts", slug: "ielts-collocations-linking", enroll: true, startDaysAgo: 12, newPerDay: 6, recall: 0.62, activeRate: 0.7, today: "none", mocks: [{ daysAgo: 3, count: 10, durationMin: 8, passPct: 60, skill: 0.55 }] }],
  },
  {
    key: "haidang",
    sets: [
      { ws: "dsa", slug: "dsa-bigo-sorting", enroll: true, startDaysAgo: 14, newPerDay: 10, recall: 0.9, activeRate: 0.95, today: "partial", mocks: [{ daysAgo: 8, count: 12, durationMin: 12, passPct: 70, skill: 0.88 }, { daysAgo: 2, count: 12, durationMin: 12, passPct: 70, skill: 0.92 }] },
      { ws: "dsa", slug: "dsa-tree-heap-graph", enroll: true, startDaysAgo: 11, newPerDay: 8, recall: 0.84, activeRate: 0.85, today: "none" },
    ],
  },
  {
    key: "tuankiet",
    sets: [
      { ws: "dsa", slug: "dsa-bigo-sorting", enroll: true, startDaysAgo: 13, newPerDay: 8, recall: 0.8, activeRate: 0.85, today: "none" },
      { ws: "dsa", slug: "dsa-dp-strategy", enroll: true, startDaysAgo: 9, newPerDay: 6, recall: 0.7, activeRate: 0.75, today: "none" },
    ],
  },
  {
    key: "quocbao",
    sets: [
      { ws: "backend", slug: "backend-mongo-prisma", enroll: true, startDaysAgo: 12, newPerDay: 10, recall: 0.9, activeRate: 0.85, today: "partial", mocks: [{ daysAgo: 3, count: 10, durationMin: 10, passPct: 70, skill: 0.9 }] },
      { ws: "backend", slug: "backend-node-security", enroll: true, startDaysAgo: 8, newPerDay: 8, recall: 0.82, activeRate: 0.8, today: "none" },
    ],
  },
  {
    key: "thaonguyen",
    sets: [
      { ws: "uiux", slug: "uiux-figma-cong-cu", enroll: true, startDaysAgo: 12, newPerDay: 8, recall: 0.82, activeRate: 0.85, today: "none" },
      { ws: "uiux", slug: "uiux-nghien-cuu-ux", enroll: true, startDaysAgo: 9, newPerDay: 8, recall: 0.76, activeRate: 0.8, today: "none" },
    ],
  },
  {
    key: "giabao",
    sets: [{ ws: "math", slug: "math-gioi-han-dao-ham", enroll: true, startDaysAgo: 7, newPerDay: 6, recall: 0.5, activeRate: 0.7, today: "none" }],
  },
  {
    key: "hieutrung",
    sets: [{ ws: "math", slug: "math-ma-tran-xac-suat", enroll: true, startDaysAgo: 10, newPerDay: 5, recall: 0.45, activeRate: 0.55, today: "none", mocks: [{ daysAgo: 2, count: 10, durationMin: 6, passPct: 60, skill: 0.5, auto: true, backgrounds: 3 }] }],
  },
];
