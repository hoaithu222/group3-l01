import type { PrismaClient } from "@prisma/client";
import { normalizeSearch } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import { buildLessonContent } from "../services/content/build-lesson-content";

const SUBJECT_SLUG = "english";
const CONTENT_OWNER_EMAIL = "content-seed@superapp.local";
const CONTENT_OWNER_NAME = "Nội dung mẫu";

/**
 * `splitLessonSections` (services/content/lesson-sections.ts) luôn cảnh báo khi KHÔNG thấy mục "## Mục tiêu buổi
 * học" / "## Checklist cuối buổi" trong `bodyMd`. Lộ trình Tiếng Anh cố tình KHÔNG dùng khung mục kiểu Fullstack —
 * mỗi ngày chỉ là vài đoạn văn ngắn, `objectives[]` được viết trực tiếp bên dưới (không trích từ bodyMd) và
 * `checklist` để trống (không phải ngày nào cũng cần tự kiểm tra). Hai cảnh báo này vì vậy LUÔN xuất hiện cho cả
 * 25 buổi và không phản ánh vấn đề thật — lọc khỏi báo cáo để không át các cảnh báo thật (vd thiếu StudySet).
 */
const EXPECTED_WARNINGS = new Set(["Không tìm thấy mục 'Mục tiêu buổi học'", "Không tìm thấy mục 'Checklist cuối buổi'"]);

interface PhaseTheme {
  index: number;
  title: string;
  stageLabel: string;
  summary: string;
  capstone: string;
  color: string;
}

/** 4 tháng theo khung CEFR — be.md p4-07 README §9.2 ("Khung đề xuất... Phase theo trình độ"). */
const PHASES: readonly PhaseTheme[] = [
  {
    index: 1,
    title: "Tháng 1 — A1: Nhập môn giao tiếp",
    stageLabel: "Giai đoạn 1 — Khởi đầu (A1)",
    summary: "Từ vựng nền tảng: gia đình, nhà ở, mua sắm, thời gian, số đếm, màu sắc, hình dạng; 4 thì cơ bản (hiện tại đơn, hiện tại tiếp diễn, quá khứ đơn, tương lai với will) để mô tả bản thân và sinh hoạt hàng ngày.",
    capstone: "Hoàn thành bộ luyện tập tổng hợp A1-A2 (chào hỏi, gia đình, số đếm, màu sắc, mua sắm, thời tiết).",
    color: "green",
  },
  {
    index: 2,
    title: "Tháng 2 — A2: Công việc & Đời sống",
    stageLabel: "Giai đoạn 2 — Củng cố (A2)",
    summary: "Từ vựng công việc, kinh doanh, mạng xã hội, sức khoẻ, cảm xúc, thời tiết và môi trường; mạo từ, giới từ, động từ khiếm khuyết và so sánh hơn-nhất.",
    capstone: "Làm lại bộ luyện tập tổng hợp A1-A2 lần 2 để tự đo tiến bộ sau 2 tháng.",
    color: "blue",
  },
  {
    index: 3,
    title: "Tháng 3 — B1: Xã hội & Chuyên môn",
    stageLabel: "Giai đoạn 3 — Phát triển (B1)",
    summary: "Từ vựng công nghệ, khoa học, giáo dục, tài chính, du lịch, văn hoá, xã hội, thể thao; thành ngữ - cụm động từ thông dụng; hiện tại hoàn thành, câu điều kiện và câu bị động.",
    capstone: "Hoàn thành phần đầu bộ luyện tập tổng hợp B1-B2 (đọc hiểu TOEIC, ôn thì, thành ngữ).",
    color: "amber",
  },
  {
    index: 4,
    title: "Tháng 4 — B2: Học thuật & Nâng cao",
    stageLabel: "Giai đoạn 4 — Nâng cao (B2)",
    summary: "Từ vựng TOEIC 600-800, IELTS - học thuật - tài chính/marketing nâng cao; câu tường thuật, mệnh đề quan hệ, danh động từ và động từ nguyên mẫu.",
    capstone: "Hoàn thành bộ luyện tập tổng hợp B1-B2 + thử sức bộ luyện tập nâng cao C1-C2 (tuỳ chọn).",
    color: "purple",
  },
];

interface LessonSeed {
  number: number;
  phaseIndex: number;
  title: string;
  durationMinutes: number;
  objectives: readonly string[];
  bodyMd: string;
  /** slug seed (be/src/modules/study/seed/english-content.seed.ts) — tra ra StudySet id thật lúc import bằng tag `seed:<slug>`. */
  practiceSetSlugs: readonly string[];
  optional?: boolean;
}

/**
 * 25 ngày học, đánh số liên tục toàn môn — mirror cách đánh số `fullstack-b<N>`. Nội dung `bodyMd`/`objectives` do
 * phiên làm việc này TỰ VIẾT (không copy nguyên văn từ `web-study-english` hay từ seed StudySet) — chỉ tham chiếu
 * chủ đề/số liệu (số từ, số câu) đã xác nhận qua Prisma tới 16 StudySet PUBLIC đã seed sẵn (be.md §9.2).
 */
const LESSONS: readonly LessonSeed[] = [
  // ===== Tháng 1 — A1 (D1–D7) =====
  {
    number: 1,
    phaseIndex: 1,
    title: "Ngày 1: Gia đình & Các mối quan hệ",
    durationMinutes: 25,
    objectives: [
      "Nhận diện và phát âm đúng IPA của 8-10 từ vựng chỉ thành viên gia đình (mother, father, sibling, cousin, spouse…)",
      "Phân biệt các từ chỉ quan hệ họ hàng mở rộng: in-laws, nephew, niece, ancestor, descendant",
      "Đặt được 1-2 câu đơn giản giới thiệu về gia đình mình bằng tiếng Anh",
      "Hoàn thành lượt học đầu tiên trong bộ flashcard Luyện tập bên dưới",
    ],
    bodyMd:
      "Chào mừng bạn đến với Ngày 1 của lộ trình Tiếng Anh giao tiếp & IT! Chủ đề mở đầu là **gia đình** — nhóm từ vựng gần gũi và dễ dùng nhất khi bắt đầu học một ngôn ngữ mới.\n\n" +
      "Bộ flashcard Luyện tập bên dưới có hơn 120 từ song ngữ kèm phiên âm IPA và câu ví dụ, từ các từ cơ bản như *mother, father, sibling, cousin* đến các từ diễn tả tình cảm gia đình như *cherish, bond, trust*. Hôm nay chỉ cần tập trung vào nhóm từ chỉ **thành viên gia đình** — phần nhà ở và mua sắm trong cùng bộ này sẽ học ở Ngày 2 và Ngày 3.\n\n" +
      "Mẹo nhỏ: đọc to từng từ theo phiên âm, sau đó tự đặt một câu ngắn về chính gia đình bạn — nhớ lâu hơn nhiều so với chỉ đọc nghĩa.",
    practiceSetSlugs: ["en-vocab-family-home"],
  },
  {
    number: 2,
    phaseIndex: 1,
    title: "Ngày 2: Nhà ở & Đồ đạc trong nhà",
    durationMinutes: 25,
    objectives: [
      "Gọi tên được các phòng trong nhà (kitchen, bedroom, bathroom, balcony, attic, basement…)",
      "Nhận diện từ vựng liên quan tới thuê/mua nhà (landlord, tenant, mortgage, lease, deposit)",
      "Phân biệt tính từ mô tả không gian sống: cozy, spacious, cluttered",
      "Ôn lại bằng flashcard và tự chấm mức độ nhớ",
    ],
    bodyMd:
      "Vẫn dùng bộ từ vựng \"Gia đình, Nhà ở & Mua sắm\" của Ngày 1, hôm nay chuyển sang nhóm từ về **nhà ở**: các phòng trong nhà, đồ nội thất, và những từ hay gặp khi thuê hoặc mua nhà như *landlord, tenant, mortgage, lease*.\n\n" +
      "Nhóm từ về việc nhà (*chore, sweep, vacuum, laundry*) cũng nằm trong phần này — rất hữu ích nếu bạn từng xem phim/video tiếng Anh có cảnh sinh hoạt gia đình.\n\n" +
      "Hãy thử lọc trong bộ flashcard các từ liên quan tới nhà cửa để ôn tập nhanh nhóm chủ đề hôm nay.",
    practiceSetSlugs: ["en-vocab-family-home"],
  },
  {
    number: 3,
    phaseIndex: 1,
    title: "Ngày 3: Mua sắm & Tiêu dùng hàng ngày",
    durationMinutes: 25,
    objectives: [
      "Sử dụng đúng từ vựng khi đi mua sắm: discount, sale, coupon, refund, warranty",
      "Phân biệt cash/credit card, checkout/cashier, wholesale/retail",
      "Nhận biết các từ về thương mại điện tử: e-commerce, invoice, loyalty program",
      "Hoàn thành trọn bộ flashcard \"Gia đình, Nhà ở & Mua sắm\" sau 3 ngày",
    ],
    bodyMd:
      "Ngày cuối cùng với bộ từ vựng của 3 ngày đầu — nhóm chủ đề **mua sắm & tiêu dùng**: từ những từ cơ bản như *shop, store, cart* đến các tình huống thực tế như xin hoàn tiền (*refund*), đổi hàng (*exchange*), hay mặc cả (*haggle*).\n\n" +
      "Sau hôm nay, bạn đã đi qua toàn bộ hơn 120 từ của bộ \"Gia đình, Nhà ở & Mua sắm\" — hãy dành thêm vài phút ôn lại những từ còn thấy lạ trước khi chuyển sang chủ đề thời gian ở Ngày 4.",
    practiceSetSlugs: ["en-vocab-family-home"],
  },
  {
    number: 4,
    phaseIndex: 1,
    title: "Ngày 4: Thời gian, Ngày tháng & Lịch trình",
    durationMinutes: 25,
    objectives: [
      "Gọi đúng tên các đơn vị thời gian: second, minute, hour, decade, century",
      "Dùng từ vựng lịch trình: schedule, appointment, reminder, punctual, reschedule",
      "Phân biệt các cặp từ đối lập: temporary/permanent, frequent/rare, delay/punctual",
      "Luyện tập với flashcard và câu hỏi trắc nghiệm đi kèm",
    ],
    bodyMd:
      "Chủ đề hôm nay là **thời gian và lịch trình** — nhóm từ nền tảng để nói về giờ giấc, hẹn gặp và thói quen hàng ngày, từ *morning/afternoon/evening* đến các từ trang trọng hơn như *punctual, postpone, reschedule*.\n\n" +
      "Bộ luyện tập (gần 80 mục) có cả flashcard và vài câu trắc nghiệm nhanh để kiểm tra phản xạ. Hôm nay tập trung riêng phần thời gian — phần số đếm/màu sắc/hình dạng của cùng bộ này để dành cho Ngày 5.",
    practiceSetSlugs: ["en-vocab-numbers-time"],
  },
  {
    number: 5,
    phaseIndex: 1,
    title: "Ngày 5: Số đếm, Màu sắc & Hình dạng",
    durationMinutes: 25,
    objectives: [
      "Đọc đúng các số lớn: hundred, thousand, million, billion",
      "Gọi tên 10+ màu sắc và hình dạng cơ bản bằng tiếng Anh",
      "Dùng tính từ mô tả kích thước: tall, wide, narrow, deep, shallow, heavy, light",
      "Làm 2 câu trắc nghiệm ôn tập cuối bộ từ vựng",
    ],
    bodyMd:
      "Tiếp tục bộ từ vựng của Ngày 4, hôm nay học nhóm **số đếm, màu sắc và hình dạng** — rất hay dùng khi mô tả đồ vật: *circle, square, triangle, sphere, cube*, các màu ít gặp hơn đỏ/xanh thông thường như *turquoise, beige*, và các tính từ kích thước như *narrow, shallow*.\n\n" +
      "Sau ngày này bạn đã hoàn thành trọn bộ gần 80 từ + câu trắc nghiệm của chủ đề \"Thời gian, Số đếm, Màu sắc & Hình dạng\".",
    practiceSetSlugs: ["en-vocab-numbers-time"],
  },
  {
    number: 6,
    phaseIndex: 1,
    title: "Ngày 6: Thì hiện tại đơn & hiện tại tiếp diễn",
    durationMinutes: 35,
    objectives: [
      "Phân biệt cách dùng hiện tại đơn (present simple) và hiện tại tiếp diễn (present continuous)",
      "Nhận diện dấu hiệu nhận biết mỗi thì trong câu (always/every day vs now/at the moment)",
      "Làm bài tập trắc nghiệm/điền từ áp dụng 2 thì này",
      "Tự chấm điểm và ghi chú lỗi sai thường gặp",
    ],
    bodyMd:
      "Chuyển sang phần **ngữ pháp** đầu tiên của lộ trình: 2 thì cơ bản nhất trong tiếng Anh giao tiếp — hiện tại đơn (thói quen, sự thật) và hiện tại tiếp diễn (đang xảy ra).\n\n" +
      "Bộ luyện tập ngữ pháp \"Các thì cơ bản (A1-A2)\" có 32 câu hỏi trắc nghiệm và điền từ, chia đều cho 4 thì — hôm nay chỉ làm phần liên quan tới 2 thì hiện tại, phần quá khứ/tương lai để dành cho Ngày 7.",
    practiceSetSlugs: ["en-grammar-tenses-basic"],
  },
  {
    number: 7,
    phaseIndex: 1,
    title: "Ngày 7: Thì quá khứ đơn, tương lai với will & Ôn tập A1",
    durationMinutes: 40,
    objectives: [
      "Chia đúng động từ ở thì quá khứ đơn (regular/irregular verbs)",
      "Dùng \"will\" để nói về dự định/dự đoán trong tương lai",
      "Hoàn thành nốt bộ bài tập 4 thì cơ bản",
      "Làm bộ luyện tập tổng hợp A1-A2 để tự kiểm tra sau tuần đầu tiên",
    ],
    bodyMd:
      "Nốt 2 thì còn lại của tuần đầu: quá khứ đơn (kể lại chuyện đã xảy ra) và tương lai với *will* (dự đoán, quyết định tức thời). Hoàn thành bộ \"Các thì cơ bản (A1-A2)\" hôm nay.\n\n" +
      "Sau đó, hãy thử sức với bộ **Luyện tập tổng hợp A1-A2** (27 câu hỏi trắc nghiệm/điền từ trộn nhiều chủ đề: chào hỏi, gia đình, đồ ăn, số đếm, màu sắc, du lịch, mua sắm, thời tiết…) để xem mình nhớ được bao nhiêu sau 7 ngày đầu tiên. Đừng lo nếu sai nhiều — đây là bài tự kiểm tra, không tính điểm.",
    practiceSetSlugs: ["en-grammar-tenses-basic", "en-quiz-mixed-a1-a2"],
  },
  // ===== Tháng 2 — A2 (D8–D13) =====
  {
    number: 8,
    phaseIndex: 2,
    title: "Ngày 8: Công việc & Nghề nghiệp",
    durationMinutes: 30,
    objectives: [
      "Gọi tên các bước trong quá trình xin việc: resume, candidate, interview, recruit",
      "Dùng từ vựng mô tả tình trạng công việc: promote, resign, layoff, unemployment",
      "Nhận biết từ vựng phúc lợi: salary, wage, bonus, benefits, raise",
      "Luyện tập với flashcard chủ đề công việc",
    ],
    bodyMd:
      "Bước sang trình độ A2 với chủ đề **công việc & nghề nghiệp** — từ những bước đầu như viết *resume*, đi *interview*, đến khi đã đi làm với các từ như *supervisor, workload, overtime, burnout*.\n\n" +
      "Bộ từ vựng \"Công việc, Kinh doanh & Giao tiếp\" có gần 100 mục — hôm nay tập trung riêng nhóm liên quan trực tiếp tới công việc cá nhân, phần kinh doanh/giao tiếp sẽ học ở Ngày 9.",
    practiceSetSlugs: ["en-vocab-work-communication"],
  },
  {
    number: 9,
    phaseIndex: 2,
    title: "Ngày 9: Kinh doanh, Mạng xã hội & Giao tiếp công sở",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng kinh doanh cơ bản: startup, entrepreneur, strategy, revenue",
      "Nhận biết thuật ngữ mạng xã hội: hashtag, livestream, influencer, viral",
      "Dùng một số cụm động từ giao tiếp công sở: hang on, catch up, figure out, bear in mind",
      "Làm câu trắc nghiệm/điền từ tình huống cuối bộ",
    ],
    bodyMd:
      "Tiếp tục bộ từ vựng công việc, hôm nay là nhóm **kinh doanh, mạng xã hội và giao tiếp công sở**: các từ viết tắt hay gặp trong doanh nghiệp như *KPI, ROI*, thuật ngữ mạng xã hội như *headline, clickbait, misinformation*, và vài cụm động từ dùng hàng ngày như *catch up, figure out, bear in mind*.\n\n" +
      "Cuối bộ có sẵn câu hỏi trắc nghiệm tình huống — ví dụ chọn câu phù hợp để viết email công việc trang trọng.",
    practiceSetSlugs: ["en-vocab-work-communication"],
  },
  {
    number: 10,
    phaseIndex: 2,
    title: "Ngày 10: Sức khoẻ & Cảm xúc",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng y tế cơ bản: symptom, diagnose, prescription, chronic",
      "Gọi tên 15+ cảm xúc bằng tiếng Anh (happy, nervous, overwhelmed, grateful…)",
      "Phân biệt các cặp cảm xúc gần nghĩa: envy/jealous, anxious/nervous, content/delighted",
      "Tự đánh giá mức hiểu bài bằng thang 3 mức cuối buổi",
    ],
    bodyMd:
      "Chủ đề hôm nay là **sức khoẻ và cảm xúc** — nhóm từ vựng giúp bạn mô tả cảm giác cơ thể lẫn tâm trạng, từ các từ khám bệnh cơ bản (*symptom, diagnose, prescription*) đến bảng từ cảm xúc phong phú (*happy, sad, nervous, overwhelmed, grateful, insecure…*).\n\n" +
      "Bộ từ vựng \"Sức khoẻ, Cảm xúc, Thời tiết & Môi trường\" có hơn 90 mục — hôm nay học phần sức khoẻ và cảm xúc, phần thời tiết/môi trường học ở Ngày 11.",
    practiceSetSlugs: ["en-vocab-health-emotions-weather"],
  },
  {
    number: 11,
    phaseIndex: 2,
    title: "Ngày 11: Thời tiết & Môi trường",
    durationMinutes: 30,
    objectives: [
      "Mô tả thời tiết bằng tiếng Anh: sunny, humid, storm, drizzle, blizzard",
      "Dùng từ vựng biến đổi khí hậu: climate change, global warming, carbon footprint",
      "Phân biệt các hiện tượng thời tiết cực đoan: flood, drought, hurricane, typhoon",
      "Hoàn thành nốt bộ từ vựng và làm câu trắc nghiệm cuối bộ",
    ],
    bodyMd:
      "Nốt phần còn lại của bộ từ vựng: **thời tiết và môi trường**, từ các từ đơn giản (*sunny, cloudy, rainy*) tới nhóm học thuật hơn về khí hậu (*greenhouse gas, deforestation, biodiversity, sustainable*) — hữu ích nếu bạn cần đọc tin tức tiếng Anh về môi trường.\n\n" +
      "Sau ngày này bạn đã hoàn thành bộ \"Sức khoẻ, Cảm xúc, Thời tiết & Môi trường\".",
    practiceSetSlugs: ["en-vocab-health-emotions-weather"],
  },
  {
    number: 12,
    phaseIndex: 2,
    title: "Ngày 12: Mạo từ, Giới từ & Động từ khiếm khuyết",
    durationMinutes: 35,
    objectives: [
      "Dùng đúng mạo từ a/an/the trong các trường hợp phổ biến",
      "Chọn đúng giới từ chỉ thời gian và nơi chốn (in/on/at…)",
      "Dùng động từ khiếm khuyết can/should/must để diễn tả khả năng, lời khuyên, bắt buộc",
      "Làm bài tập trắc nghiệm/điền từ áp dụng",
    ],
    bodyMd:
      "Phần ngữ pháp A2: **mạo từ, giới từ và động từ khiếm khuyết** — 3 mảng ngữ pháp nhỏ nhưng gây nhầm lẫn nhiều nhất cho người mới học, đặc biệt là cách chọn giới từ thời gian/nơi chốn và phân biệt *can/should/must*.\n\n" +
      "Bộ \"Mạo từ, Giới từ, Động từ khiếm khuyết & So sánh (A1-A2)\" có 32 câu — hôm nay làm phần mạo từ/giới từ/khiếm khuyết, phần so sánh hơn-nhất để dành cho Ngày 13.",
    practiceSetSlugs: ["en-grammar-articles-prepositions"],
  },
  {
    number: 13,
    phaseIndex: 2,
    title: "Ngày 13: So sánh hơn – so sánh nhất & Ôn tập A1-A2",
    durationMinutes: 40,
    objectives: [
      "Chia đúng dạng so sánh hơn và so sánh nhất của tính từ",
      "Hoàn thành nốt bộ bài tập ngữ pháp A1-A2",
      "Làm lại bộ luyện tập tổng hợp A1-A2 lần 2 để đo tiến bộ so với Ngày 7",
      "Ghi chú lại 3-5 lỗi sai lặp lại để tự ôn thêm",
    ],
    bodyMd:
      "Nốt phần **so sánh hơn – so sánh nhất** để hoàn thành bộ ngữ pháp A1-A2, sau đó quay lại bộ **Luyện tập tổng hợp A1-A2** một lần nữa — lần này bạn đã học đủ 2 tháng, hãy so sánh kết quả với lần làm ở Ngày 7 để thấy rõ tiến bộ.\n\n" +
      "Đây là mốc kết thúc trình độ A2 của lộ trình — nếu vẫn còn từ vựng/ngữ pháp chưa chắc, nên ôn lại trước khi sang Tháng 3 (B1).",
    practiceSetSlugs: ["en-grammar-articles-prepositions", "en-quiz-mixed-a1-a2"],
  },
  // ===== Tháng 3 — B1 (D14–D20) =====
  {
    number: 14,
    phaseIndex: 3,
    title: "Ngày 14: Công nghệ & Khoa học",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng công nghệ thông tin cơ bản trong giao tiếp hàng ngày",
      "Nhận biết thuật ngữ nghiên cứu khoa học thường gặp",
      "Đặt câu mô tả một công nghệ hoặc phát minh bằng tiếng Anh",
      "Luyện tập với flashcard chủ đề công nghệ & khoa học",
    ],
    bodyMd:
      "Bước vào trình độ B1 với chủ đề **công nghệ & khoa học** — mảng từ vựng quan trọng nếu bạn làm việc trong ngành IT hoặc cần đọc tài liệu kỹ thuật tiếng Anh.\n\n" +
      "Bộ \"Công nghệ, Khoa học, Giáo dục & Tài chính\" có hơn 50 mục (kèm cả câu trắc nghiệm) — hôm nay học phần công nghệ & khoa học, phần giáo dục & tài chính học ở Ngày 15.",
    practiceSetSlugs: ["en-vocab-tech-science-finance"],
  },
  {
    number: 15,
    phaseIndex: 3,
    title: "Ngày 15: Giáo dục & Tài chính - Kinh tế",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng giáo dục: mô tả bậc học, kỳ thi, học bổng",
      "Dùng từ vựng tài chính - kinh tế cơ bản trong hội thoại",
      "Phân biệt các thuật ngữ tài chính dễ nhầm lẫn",
      "Hoàn thành bộ từ vựng và làm câu trắc nghiệm cuối bộ",
    ],
    bodyMd:
      "Nốt phần còn lại của bộ từ vựng: **giáo dục và tài chính - kinh tế** — hai chủ đề hay xuất hiện trong bài thi và giao tiếp công việc.\n\n" +
      "Sau ngày này bạn đã hoàn thành bộ \"Công nghệ, Khoa học, Giáo dục & Tài chính\".",
    practiceSetSlugs: ["en-vocab-tech-science-finance"],
  },
  {
    number: 16,
    phaseIndex: 3,
    title: "Ngày 16: Du lịch, Ẩm thực & Giải trí",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng du lịch: đặt phòng, sân bay, hành lý, tham quan",
      "Gọi tên món ăn và cách chế biến bằng tiếng Anh",
      "Dùng từ vựng nghệ thuật - truyền thông - giải trí",
      "Luyện tập với phần đầu bộ flashcard chủ đề này",
    ],
    bodyMd:
      "Chủ đề hôm nay là **du lịch, ẩm thực và giải trí** — nhóm từ vựng thực tế nhất khi đi công tác/du lịch hoặc trò chuyện phiếm với người nước ngoài.\n\n" +
      "Bộ \"Xã hội, Văn hoá, Du lịch & Giải trí\" là bộ lớn nhất trong lộ trình (hơn 130 mục) nên được chia làm 2 ngày — hôm nay học phần du lịch, ẩm thực, nghệ thuật và giải trí, phần văn hoá - xã hội - thể thao học ở Ngày 17.",
    practiceSetSlugs: ["en-vocab-society-culture-travel"],
  },
  {
    number: 17,
    phaseIndex: 3,
    title: "Ngày 17: Văn hoá, Xã hội - Pháp luật & Thể thao",
    durationMinutes: 30,
    objectives: [
      "Dùng từ vựng văn hoá - lễ hội trong hội thoại",
      "Nhận biết thuật ngữ xã hội - pháp luật cơ bản",
      "Dùng từ vựng thể thao thông dụng",
      "Hoàn thành trọn bộ hơn 130 từ sau 2 ngày",
    ],
    bodyMd:
      "Nốt phần còn lại của bộ từ vựng lớn nhất lộ trình: **văn hoá - lễ hội, xã hội - pháp luật và thể thao**.\n\n" +
      "Sau ngày này bạn đã hoàn thành bộ \"Xã hội, Văn hoá, Du lịch & Giải trí\" — một trong những bộ đa dạng chủ đề nhất, hữu ích để đọc hiểu tin tức tiếng Anh.",
    practiceSetSlugs: ["en-vocab-society-culture-travel"],
  },
  {
    number: 18,
    phaseIndex: 3,
    title: "Ngày 18: Thành ngữ & Cụm động từ thông dụng",
    durationMinutes: 30,
    objectives: [
      "Nhận biết và dùng đúng ngữ cảnh 10+ thành ngữ tiếng Anh thông dụng",
      "Dùng cụm động từ (phrasal verb) trong câu nói tự nhiên",
      "Phân biệt nghĩa đen và nghĩa bóng của thành ngữ",
      "Luyện tập với trọn bộ 42 thành ngữ/cụm động từ",
    ],
    bodyMd:
      "Chủ đề hôm nay giúp bạn nói tiếng Anh **tự nhiên hơn**: 42 thành ngữ (idiom) và cụm động từ (phrasal verb) thông dụng nhất, kèm nghĩa và câu ví dụ.\n\n" +
      "Đây là nhóm từ vựng khó nhất tới giờ vì nghĩa thường không suy ra được từ từng từ riêng lẻ — nên dành thời gian đọc kỹ câu ví dụ thay vì chỉ học nghĩa.",
    practiceSetSlugs: ["en-idioms-phrasal-verbs"],
  },
  {
    number: 19,
    phaseIndex: 3,
    title: "Ngày 19: Hiện tại hoàn thành, Câu điều kiện & Câu bị động",
    durationMinutes: 40,
    objectives: [
      "Dùng đúng thì hiện tại hoàn thành (Present Perfect) trong giao tiếp",
      "Phân biệt 4 loại câu điều kiện (0/1/2/3)",
      "Chuyển câu chủ động sang câu bị động đúng cấu trúc",
      "Làm bài tập trắc nghiệm/điền từ áp dụng cả 3 chủ điểm",
    ],
    bodyMd:
      "Ba chủ điểm ngữ pháp quan trọng của trình độ B1: **hiện tại hoàn thành, câu điều kiện (0/1/2/3) và câu bị động** — nền tảng để diễn đạt ý phức tạp hơn thay vì chỉ dùng câu đơn.\n\n" +
      "Bộ luyện tập có 18 câu trắc nghiệm/điền từ bám sát 3 chủ điểm này — làm chậm và đọc kỹ nếu sai, vì đây là ngữ pháp hay xuất hiện trong các bài thi chuẩn hoá.",
    practiceSetSlugs: ["en-grammar-perfect-conditionals-passive"],
  },
  {
    number: 20,
    phaseIndex: 3,
    title: "Ngày 20: Ôn tập B1 — Đọc hiểu, Ôn thì & Thành ngữ",
    durationMinutes: 40,
    objectives: [
      "Ôn lại các thì đã học qua bài trắc nghiệm tổng hợp",
      "Luyện đọc hiểu đoạn văn phong cách TOEIC",
      "Ôn lại thành ngữ/cụm động từ đã học ở Ngày 18",
      "Tự đánh giá những chủ điểm cần học lại trước khi sang B2",
    ],
    bodyMd:
      "Ngày ôn tập khép lại trình độ B1: bộ **Luyện tập tổng hợp B1-B2** (34 câu) trộn nhiều chủ điểm đã học — công việc, sức khoẻ, môi trường, ôn thì, cụm động từ, email công sở, thành ngữ, đọc hiểu TOEIC, câu điều kiện, thuyết trình.\n\n" +
      "Hôm nay chỉ cần làm phần liên quan tới nội dung đã học tới Ngày 19 (B1); phần còn lại của bộ này sẽ dùng lại ở Ngày 23 sau khi học xong ngữ pháp B2.",
    practiceSetSlugs: ["en-quiz-mixed-b1-b2"],
  },
  // ===== Tháng 4 — B2 (D21–D25) =====
  {
    number: 21,
    phaseIndex: 4,
    title: "Ngày 21: Từ vựng TOEIC 600-800 & Văn phòng",
    durationMinutes: 35,
    objectives: [
      "Dùng từ vựng văn phòng thường gặp trong đề thi TOEIC",
      "Nhận biết từ vựng họp hành và công việc hàng ngày ở mức B2",
      "Làm quen dạng câu hỏi từ vựng kiểu TOEIC (chọn từ đúng ngữ cảnh)",
      "Luyện tập với bộ hơn 100 mục TOEIC 600-800",
    ],
    bodyMd:
      "Bước vào trình độ B2 với chủ đề **từ vựng TOEIC 600-800 và văn phòng** — nhóm từ vựng thiết thực nếu bạn đang luyện thi TOEIC hoặc làm việc trong môi trường công sở dùng tiếng Anh.\n\n" +
      "Bộ \"Từ vựng TOEIC 600-800 & Văn phòng\" có hơn 100 mục gồm cả flashcard, trắc nghiệm và điền từ — dạng bài sát với đề thi thật để bạn làm quen phong cách câu hỏi.",
    practiceSetSlugs: ["en-vocab-toeic-600-800"],
  },
  {
    number: 22,
    phaseIndex: 4,
    title: "Ngày 22: Câu tường thuật & Mệnh đề quan hệ",
    durationMinutes: 35,
    objectives: [
      "Chuyển câu trực tiếp sang câu tường thuật (reported speech) đúng quy tắc lùi thì",
      "Dùng mệnh đề quan hệ với who/which/whose/where/when",
      "Nhận biết khi nào có thể lược bỏ đại từ quan hệ",
      "Làm bài tập trắc nghiệm/điền từ áp dụng",
    ],
    bodyMd:
      "Ngữ pháp nâng cao B2: **câu tường thuật (reported speech)** và **mệnh đề quan hệ** (who/which/whose/where/when) — 2 cấu trúc giúp câu văn phức tạp và tự nhiên hơn, thường gặp khi kể lại lời người khác nói hoặc bổ sung thông tin cho danh từ.\n\n" +
      "Bộ \"Ngữ pháp nâng cao (B2)\" có 19 câu — hôm nay làm phần câu tường thuật và mệnh đề quan hệ, phần danh động từ/động từ nguyên mẫu để dành cho Ngày 23.",
    practiceSetSlugs: ["en-grammar-advanced-clauses"],
  },
  {
    number: 23,
    phaseIndex: 4,
    title: "Ngày 23: Danh động từ, Động từ nguyên mẫu & Ôn tập B1-B2",
    durationMinutes: 40,
    objectives: [
      "Phân biệt khi nào dùng danh động từ (gerund) và động từ nguyên mẫu (infinitive)",
      "Hoàn thành nốt bộ bài tập ngữ pháp nâng cao B2",
      "Làm nốt phần còn lại của bộ luyện tập tổng hợp B1-B2",
      "Tổng kết lại các chủ điểm ngữ pháp đã học từ Ngày 6 tới nay",
    ],
    bodyMd:
      "Nốt phần **danh động từ và động từ nguyên mẫu** để hoàn thành bộ ngữ pháp nâng cao B2, sau đó quay lại bộ **Luyện tập tổng hợp B1-B2** để làm nốt các câu còn lại (thuyết trình, câu điều kiện nâng cao…) chưa làm ở Ngày 20.\n\n" +
      "Đây là lúc thích hợp để nhìn lại toàn bộ ngữ pháp đã học: 4 thì cơ bản, mạo từ/giới từ/khiếm khuyết, so sánh, hiện tại hoàn thành, điều kiện, bị động, tường thuật, mệnh đề quan hệ, danh động từ.",
    practiceSetSlugs: ["en-grammar-advanced-clauses", "en-quiz-mixed-b1-b2"],
  },
  {
    number: 24,
    phaseIndex: 4,
    title: "Ngày 24: Từ vựng IELTS, Học thuật & Tài chính - Marketing nâng cao",
    durationMinutes: 35,
    objectives: [
      "Dùng từ vựng học thuật thường gặp trong IELTS band 6+",
      "Nhận biết thuật ngữ tài chính - marketing chuyên sâu",
      "Diễn đạt ý kiến bằng từ vựng học thuật thay vì từ thông dụng",
      "Luyện tập với bộ hơn 90 mục nâng cao",
    ],
    bodyMd:
      "Chủ đề khép lại phần từ vựng của lộ trình: **từ vựng IELTS, học thuật và tài chính - marketing nâng cao** — nhóm từ vựng \"nâng cấp\" giúp câu nói/viết của bạn nghe trang trọng và chuyên nghiệp hơn.\n\n" +
      "Bộ \"Từ vựng IELTS, Học thuật & Tài chính - Marketing nâng cao\" có hơn 90 mục — độ khó cao hơn hẳn các bộ trước, nên đừng ngại làm chậm và tra lại những từ chưa quen.",
    practiceSetSlugs: ["en-vocab-ielts-academic-finance-marketing"],
  },
  {
    number: 25,
    phaseIndex: 4,
    title: "Ngày 25 (tuỳ chọn): Thử thách nâng cao C1-C2",
    durationMinutes: 45,
    objectives: [
      "Thử sức với từ vựng và ngữ pháp mức C1-C2 (ngoài khung chương trình chính)",
      "Nhận biết các sắc thái nghĩa tinh tế giữa các từ gần nghĩa",
      "Làm quen văn phong học thuật/tranh luận nâng cao",
      "Tự đánh giá xem đã sẵn sàng học tiếp lên C1 hay chưa",
    ],
    bodyMd:
      "Buổi **tuỳ chọn** dành cho ai muốn thử sức vượt khung chương trình B2 chính thức: bộ **Luyện tập tổng hợp nâng cao C1-C2** (32 câu) với các chủ đề khó hơn hẳn — IELTS Speaking, từ vựng nâng cao, viết học thuật, phỏng vấn xin việc, bị động nâng cao, tranh luận, sắc thái từ vựng, phân tích văn học, đảo ngữ, đọc phản biện.\n\n" +
      "Buổi này KHÔNG tính vào tiến độ bắt buộc của lộ trình — cứ thoải mái thử sức, sai nhiều cũng không sao, đây chỉ là thước đo để biết mình đang ở đâu so với C1.",
    practiceSetSlugs: ["en-quiz-mixed-c1-c2"],
    optional: true,
  },
];

export interface ImportOptions {
  dryRun: boolean;
  overwrite: boolean;
}

export interface ImportLessonReport {
  number: number;
  slug: string;
  title: string;
  status: "created" | "updated" | "skipped-edited" | "unchanged";
  practiceSetCount: number;
  warnings: string[];
}

export interface ImportReport {
  phases: number;
  lessons: ImportLessonReport[];
}

async function ensureContentOwner(client: PrismaClient): Promise<string> {
  const owner = await client.user.upsert({
    where: { email: CONTENT_OWNER_EMAIL },
    update: {},
    create: { email: CONTENT_OWNER_EMAIL, name: CONTENT_OWNER_NAME, normalizedName: normalizeSearch(CONTENT_OWNER_NAME), role: "user", status: "ACTIVE", emailVerified: true, emailVerifiedAt: new Date() },
  });
  return owner.id;
}

async function ensureSubject(client: PrismaClient, ownerId: string): Promise<{ id: string; version: number }> {
  const existing = await client.roadmapSubject.findUnique({ where: { slug: SUBJECT_SLUG } });
  if (existing) return existing;
  const title = "Tiếng Anh giao tiếp & IT";
  const created = await client.roadmapSubject.create({
    data: {
      slug: SUBJECT_SLUG,
      title,
      normalizedTitle: normalizeSearch(title),
      description: "Lộ trình tự học tiếng Anh giao tiếp và công nghệ thông tin theo khung CEFR A1→B2 — từ vựng theo chủ đề, ngữ pháp trọng tâm và bộ luyện tập trắc nghiệm/điền từ cho từng trình độ, 4 tháng, 25 ngày học.",
      category: "language",
      color: "teal",
      icon: "languages",
      // coverAssetId: nullable không @default — ghi null tường minh (như PrismaRoadmapSubjectRepository.create) để
      // không rơi vào bẫy Mongo null-vs-absent (be.md p4-07 README §3) dù hiện chưa có truy vấn lọc theo field này.
      coverAssetId: null,
      lessonLabel: "Ngày",
      defaultStudyDays: [1, 3, 5],
      unlockMode: "FREE",
      status: "DRAFT",
      order: 2048,
      phaseCount: 0,
      lessonCount: 0,
      requiredLessonCount: 0,
      sourceRef: "import:english",
      version: 1,
      createdBy: ownerId,
      updatedBy: null,
      publishedAt: null,
      archivedAt: null,
      deletedAt: null,
    },
  });
  return created;
}

async function ensurePhase(client: PrismaClient, subjectId: string, theme: PhaseTheme): Promise<string> {
  const existing = await client.roadmapPhase.findFirst({ where: { subjectId, index: theme.index } });
  if (existing) return existing.id;
  const created = await client.roadmapPhase.create({
    data: { subjectId, index: theme.index, title: theme.title, summary: theme.summary, stageLabel: theme.stageLabel, color: theme.color, capstone: theme.capstone, order: theme.index * 1024, lessonCount: 0, version: 1, deletedAt: null },
  });
  return created.id;
}

/** Tra StudySet id thật theo tag `seed:<slug>` của owner nội dung mẫu — KHÔNG hard-code ObjectId (khác môi trường sẽ khác id). */
async function resolvePracticeSetIds(client: PrismaClient, ownerId: string, slugs: readonly string[]): Promise<{ ids: string[]; missing: string[] }> {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const set = await client.studySet.findFirst({ where: { ownerId, tags: { has: `seed:${slug}` } }, select: { id: true } });
    if (set) ids.push(set.id);
    else missing.push(slug);
  }
  return { ids, missing };
}

/** Nhập/đồng bộ lộ trình Tiếng Anh (4 tháng A1–B2, 25 ngày) — idempotent theo slug `english-d<N>` (be.md §9.2). */
export async function importEnglishRoadmap(client: PrismaClient, opts: ImportOptions): Promise<ImportReport> {
  const ownerId = opts.dryRun ? (await client.user.findUnique({ where: { email: CONTENT_OWNER_EMAIL } }))?.id ?? null : await ensureContentOwner(client);
  const subject = opts.dryRun ? null : await ensureSubject(client, ownerId!);

  const phaseIds = new Map<number, string>();
  if (!opts.dryRun && subject) {
    for (const theme of PHASES) phaseIds.set(theme.index, await ensurePhase(client, subject.id, theme));
  }

  const lessons: ImportLessonReport[] = [];

  for (const seed of LESSONS) {
    const slug = `${SUBJECT_SLUG}-d${seed.number}`;
    const { ids: practiceSetIds, missing } = ownerId ? await resolvePracticeSetIds(client, ownerId, seed.practiceSetSlugs) : { ids: [], missing: [...seed.practiceSetSlugs] };

    const built = buildLessonContent(seed.bodyMd, []);
    const warnings = built.warnings.filter((w) => !EXPECTED_WARNINGS.has(w));
    if (missing.length > 0) warnings.push(`Không tìm thấy StudySet đã seed cho slug: ${missing.join(", ")}`);

    if (opts.dryRun) {
      lessons.push({ number: seed.number, slug, title: seed.title, status: "unchanged", practiceSetCount: practiceSetIds.length, warnings });
      continue;
    }

    const existing = await client.roadmapLesson.findUnique({ where: { slug } });
    if (existing && existing.updatedBy && !opts.overwrite) {
      lessons.push({ number: seed.number, slug, title: existing.title, status: "skipped-edited", practiceSetCount: existing.practiceSetIds.length, warnings: [] });
      continue;
    }

    const lessonId = existing?.id ?? newObjectId();
    const phaseId = phaseIds.get(seed.phaseIndex)!;
    const title = seed.title;
    const data = {
      subjectId: subject!.id,
      phaseId,
      slug,
      number: seed.number,
      title,
      normalizedTitle: normalizeSearch(title),
      summary: null,
      durationMinutes: seed.durationMinutes,
      prerequisites: null,
      objectives: [...seed.objectives],
      bodyMd: built.bodyMd,
      blocks: built.blocks as unknown as object,
      blocksFormat: 1,
      checklist: built.checklist,
      resources: built.resources,
      practiceSetIds,
      mediaCount: 0,
      optional: seed.optional ?? false,
      published: true,
      order: seed.number * 1024,
      updatedBy: null,
      deletedAt: null,
    };

    if (existing) {
      await client.roadmapLesson.update({ where: { id: lessonId }, data: { ...data, version: { increment: 1 } } });
    } else {
      await client.roadmapLesson.create({ data: { id: lessonId, ...data, version: 1 } });
    }
    lessons.push({ number: seed.number, slug, title, status: existing ? "updated" : "created", practiceSetCount: practiceSetIds.length, warnings });
  }

  if (!opts.dryRun && subject) {
    const requiredPublished = LESSONS.filter((s) => !s.optional).length;
    await client.roadmapSubject.update({
      where: { id: subject.id },
      data: { phaseCount: PHASES.length, lessonCount: LESSONS.length, requiredLessonCount: requiredPublished },
    });
    for (const theme of PHASES) {
      const count = await client.roadmapLesson.count({ where: { subjectId: subject.id, deletedAt: null, phaseId: phaseIds.get(theme.index) } });
      await client.roadmapPhase.updateMany({ where: { subjectId: subject.id, index: theme.index }, data: { lessonCount: count } });
    }
  }

  return { phases: PHASES.length, lessons };
}
