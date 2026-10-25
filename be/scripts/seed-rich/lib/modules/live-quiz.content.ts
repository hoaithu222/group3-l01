/**
 * Kế hoạch các phiên Live Quiz đã kết thúc (phân hệ `live-quiz`). Chỉ khai báo — việc chấm điểm/ghi DB ở `live-quiz.ts`.
 *
 * Mỗi người chơi có `skill` (xác suất đúng mỗi câu, 0–1) và `speed` (0–1, càng cao càng bấm nhanh). Đáp án từng câu được sinh TẤT ĐỊNH
 * theo (phiên, người, câu) nên chạy lại cho đúng cùng kết quả; điểm tính bằng đúng công thức của `live-quiz-scoring.ts`.
 */
import type { PersonKey } from "../../types";

export interface QuizPlayerPlan {
  who: PersonKey;
  skill: number;
  speed: number;
  /** Biệt danh trong phòng (mặc định: tên tài khoản). */
  nick?: string;
}

export interface QuizPlan {
  key: string;
  ws: string;
  /** Slug bộ học (tag `seed-rich:<slug>`). */
  slug: string;
  host: PersonKey;
  /** Số ngày trước hôm nay mở phòng chờ. */
  day: number;
  at: [number, number];
  /** Số câu tối đa muốn dùng (bộ học có bao nhiêu câu trắc nghiệm một đáp án thì dùng bấy nhiêu, tối đa `count`). */
  count: number;
  seconds: number;
  autoAdvance?: boolean;
  /** Host kết thúc sớm sau khi công bố đáp án câu thứ `stopAfter` (1-based) → `endReason = HOST_ENDED`; bỏ trống = chơi hết (`COMPLETED`). */
  stopAfter?: number;
  players: QuizPlayerPlan[];
}

const q = (who: PersonKey, skill: number, speed: number, nick?: string): QuizPlayerPlan => ({ who, skill, speed, nick });

export const QUIZ_PLANS: readonly QuizPlan[] = [
  { key: "ielts-vocab", ws: "ielts", slug: "ielts-academic-vocabulary", host: "camtu", day: 11, at: [20, 30], count: 4, seconds: 20,
    players: [q("thu", 1, 0.9), q("anhthu", 0.85, 0.6), q("yennhi", 0.8, 0.7), q("quynhnhu", 0.7, 0.5), q("khanhlinh", 0.8, 0.9, "Linh Ghi Chép"), q("thuhien", 0.6, 0.4), q("hieutrung", 0.5, 0.6), q("baochau", 0.55, 0.3)] },
  { key: "dsa-bigo", ws: "dsa", slug: "dsa-bigo-sorting", host: "haidang", day: 9, at: [19, 0], count: 4, seconds: 20,
    players: [q("thu", 0.75, 0.7), q("tuankiet", 0.95, 0.95, "Kiệt LeetCode"), q("trungkien", 0.9, 0.6), q("minhkhoi", 0.85, 0.8), q("khanhlinh", 0.6, 0.5), q("phuongthao", 0.65, 0.7), q("nhatminh", 0.5, 0.4), q("baochau", 0.4, 0.5), q("ducanh", 0.45, 0.3), q("hoanglong", 0.55, 0.6)] },
  { key: "capstone-erd", ws: "capstone", slug: "capstone-co-so-du-lieu-erd", host: "phuocloi", day: 8, at: [15, 0], count: 4, seconds: 25,
    players: [q("thu", 0.7, 0.6), q("ngocdiep", 0.85, 0.5), q("ngoclan", 0.75, 0.6), q("duyhung", 0.9, 0.8), q("vietdung", 0.6, 0.7), q("phuongthao", 0.65, 0.5), q("thuhien", 0.5, 0.6)] },
  { key: "backend-rest", ws: "backend", slug: "backend-http-rest", host: "quocbao", day: 6, at: [17, 0], count: 4, seconds: 20, stopAfter: 3,
    players: [q("thu", 0.85, 0.6), q("minhanh", 0.9, 0.8), q("hoanglong", 0.6, 0.7), q("tuankiet", 0.8, 0.9), q("phuongthao", 0.75, 0.5), q("giahuy", 0.5, 0.8, "Huy Docker"), q("vietdung", 0.7, 0.5), q("haidang", 0.85, 0.7), q("ducanh", 0.4, 0.4)] },
  { key: "frontend-js", ws: "frontend", slug: "frontend-javascript-es6", host: "thu", day: 4, at: [18, 30], count: 4, seconds: 20,
    players: [q("minhanh", 0.9, 0.8), q("ducanh", 0.55, 0.5), q("hoanglong", 0.7, 0.8), q("baochau", 0.45, 0.4), q("khanhlinh", 0.8, 0.6), q("tuankiet", 0.85, 0.9), q("myhanh", 0.5, 0.5), q("giahuy", 0.65, 0.7), q("thuytrang", 0.75, 0.6)] },
  { key: "appdev-rest", ws: "appdev", slug: "appdev-rest-mongodb", host: "thu", day: 3, at: [19, 0], count: 4, seconds: 25, autoAdvance: true,
    players: [q("minhanh", 0.8, 0.7), q("hoanglong", 0.65, 0.8), q("quocbao", 0.95, 0.7), q("thuytrang", 0.5, 0.5), q("giahuy", 0.6, 0.6), q("phuongthao", 0.7, 0.5), q("duyhung", 0.9, 0.8), q("kimngan", 0.45, 0.4)] },
  { key: "math-limit", ws: "math", slug: "math-gioi-han-dao-ham", host: "baotram", day: 2, at: [18, 0], count: 4, seconds: 30,
    players: [q("thu", 0.55, 0.6), q("myhanh", 0.5, 0.4), q("nhatminh", 0.7, 0.8), q("hieutrung", 0.35, 0.5, "Trung Sợ Toán"), q("tanphat", 0.8, 0.7), q("quynhnhu", 0.6, 0.5), q("yennhi", 0.75, 0.6), q("giabao", 0.45, 0.3), q("trungkien", 0.95, 0.8)] },
  { key: "uiux-principles", ws: "uiux", slug: "uiux-nguyen-ly-thiet-ke", host: "thaonguyen", day: 1, at: [20, 0], count: 4, seconds: 20,
    players: [q("thu", 1, 0.97), q("minhanh", 0.8, 0.7), q("thuhien", 0.9, 0.8), q("ducanh", 0.5, 0.5), q("baochau", 0.6, 0.4), q("giabao", 0.55, 0.6), q("khanhlinh", 0.7, 0.7), q("thanhtung", 0.65, 0.6), q("myhanh", 0.4, 0.5), q("hoanglong", 0.75, 0.9)] },
];
