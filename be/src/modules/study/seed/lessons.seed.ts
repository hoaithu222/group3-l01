import type { PrismaClient } from "@prisma/client";
import { normalizeSearch } from "../../../core/utils/normalize";
import { TRUE_OPTION_ID, FALSE_OPTION_ID, typesMask, type StudyItemContent } from "../entities/study-item.interface";
import { newOptionId } from "../services/study-item.builder";
import { normalizeTags } from "../services/study-tags";

/**
 * Seed ĐỀ XUẤT — bộ học công khai (StudySet PUBLIC) chủ đề lập trình + tiếng Anh, làm nội dung mẫu/khởi động cho Trung
 * tâm Học tập (Phân hệ 3, `study`). Sở hữu bởi 1 user hệ thống riêng (không phải admin) để không phụ thuộc
 * SEED_ADMIN_PASSWORD. Idempotent theo tag `seed:<slug>`: CHỈ TẠO bộ khi tag đó CHƯA có của user này; KHÔNG BAO GIỜ ghi
 * đè/xoá bộ đã tồn tại — nếu nội dung seed ở đây đổi sau này, bộ cũ vẫn giữ nguyên (sửa/xoá thì làm trực tiếp trong app).
 */

const CONTENT_OWNER_EMAIL = "content-seed@superapp.local";
const CONTENT_OWNER_NAME = "Nội dung mẫu";

type SeedItem =
  | { type: "FLASHCARD"; prompt: string; answerText: string; tags?: readonly string[] }
  | { type: "MULTIPLE_CHOICE"; prompt: string; options: readonly string[]; correctIndex: number; tags?: readonly string[] }
  | { type: "TRUE_FALSE"; prompt: string; correct: boolean; tags?: readonly string[] };

interface SeedSet {
  /** Khoá ổn định để nhận diện bộ đã seed (lưu trong tag `seed:<slug>`) — KHÔNG đổi sau khi đã seed ở môi trường nào. */
  slug: string;
  title: string;
  description: string;
  tags: readonly string[];
  language: string;
  items: readonly SeedItem[];
}

function buildItemContent(item: SeedItem): StudyItemContent {
  const tags = normalizeTags(item.tags ?? []);
  const base = { explanation: null, frontMediaAssetId: null, backMediaAssetId: null, audioAssetId: null, tags };
  switch (item.type) {
    case "FLASHCARD":
      return { ...base, type: "FLASHCARD", prompt: item.prompt, answerText: item.answerText, options: [], correctOptionIds: [], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
    case "MULTIPLE_CHOICE": {
      const options = item.options.map((text) => ({ id: newOptionId(), text, mediaAssetId: null }));
      return { ...base, type: "MULTIPLE_CHOICE", prompt: item.prompt, answerText: null, options, correctOptionIds: [options[item.correctIndex].id], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
    }
    case "TRUE_FALSE":
      return {
        ...base,
        type: "TRUE_FALSE",
        prompt: item.prompt,
        answerText: null,
        options: [
          { id: TRUE_OPTION_ID, text: "Đúng", mediaAssetId: null },
          { id: FALSE_OPTION_ID, text: "Sai", mediaAssetId: null },
        ],
        correctOptionIds: [item.correct ? TRUE_OPTION_ID : FALSE_OPTION_ID],
        acceptedAnswers: [],
        matchMode: "IGNORE_CASE",
      };
  }
}

export const LESSON_SET_SEEDS: readonly SeedSet[] = [
  {
    slug: "js-ts-basics",
    title: "Lập trình: JavaScript/TypeScript cơ bản",
    description: "Bộ flashcard + trắc nghiệm ôn khái niệm nền tảng của JavaScript/TypeScript và React (Native) hay gặp khi code app.",
    tags: ["lap-trinh", "javascript", "typescript", "react"],
    language: "vi",
    items: [
      { type: "FLASHCARD", prompt: "let, const, var khác nhau thế nào về phạm vi?", answerText: "var có phạm vi hàm (function-scope) và bị hoisting; let/const có phạm vi khối (block-scope). const không cho gán lại tham chiếu sau khi khai báo, let thì được." },
      { type: "FLASHCARD", prompt: "Closure là gì?", answerText: "Một hàm 'nhớ' được các biến trong phạm vi bao quanh nó, dùng được các biến đó ngay cả sau khi hàm ngoài đã return." },
      { type: "FLASHCARD", prompt: "== và === khác nhau ở điểm nào?", answerText: "== so sánh sau khi ép kiểu (type coercion); === so sánh cả giá trị và kiểu dữ liệu, không ép kiểu." },
      { type: "MULTIPLE_CHOICE", prompt: "console.log(typeof NaN) in ra gì?", options: ["'nan'", "'number'", "'undefined'", "'NaN'"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Promise có mấy trạng thái, là gì?", answerText: "3 trạng thái: pending (đang chờ), fulfilled (đã xong, có giá trị), rejected (thất bại, có lỗi)." },
      { type: "FLASHCARD", prompt: "async/await dùng để làm gì?", answerText: "Cú pháp giúp viết code bất đồng bộ (dựa trên Promise) trông giống code đồng bộ, dễ đọc hơn .then/.catch." },
      { type: "MULTIPLE_CHOICE", prompt: "Trong TypeScript, kiểu nào cho phép giá trị là bất kỳ loại gì mà VẪN được kiểm tra kiểu khi dùng?", options: ["any", "unknown", "never", "void"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Interface trong TypeScript dùng để làm gì?", answerText: "Định nghĩa 'hình dạng' (shape) của một object: các thuộc tính, kiểu dữ liệu và có bắt buộc hay không, giúp kiểm tra kiểu tại thời điểm compile." },
      { type: "FLASHCARD", prompt: "map() và forEach() khác nhau ở điểm nào?", answerText: "map() trả về một mảng mới chứa kết quả từng phần tử; forEach() không trả về gì (undefined), chỉ dùng để lặp và thực hiện side-effect." },
      { type: "MULTIPLE_CHOICE", prompt: "Đâu là cách đúng để kiểm tra một biến có phải mảng trong JavaScript?", options: ["typeof arr === 'array'", "Array.isArray(arr)", "arr instanceof List", "arr.isArray()"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Spread operator (...) dùng để làm gì?", answerText: "Tách các phần tử của mảng/object ra thành từng phần riêng — dùng để copy, gộp mảng/object hoặc truyền nhiều đối số cho hàm." },
      { type: "FLASHCARD", prompt: "Destructuring là gì?", answerText: "Cú pháp lấy nhanh giá trị từ mảng hoặc object ra biến, ví dụ: const { name, age } = user;" },
      { type: "TRUE_FALSE", prompt: "Trong JavaScript, hàm là 'first-class citizen' (có thể gán cho biến, truyền làm tham số, trả về từ hàm khác).", correct: true },
      { type: "FLASHCARD", prompt: "useState trong React (Native) dùng để làm gì?", answerText: "Khai báo một state cục bộ trong component; khi state đổi, component tự render lại để hiển thị giá trị mới." },
      { type: "FLASHCARD", prompt: "useEffect dùng để làm gì?", answerText: "Chạy 'side effect' (gọi API, subscribe, timer...) sau khi component render; có thể chạy lại khi dependency đổi, và cleanup khi unmount." },
      { type: "MULTIPLE_CHOICE", prompt: "Hàm nào dùng để lọc phần tử trong mảng theo điều kiện, trả về mảng mới?", options: ["reduce", "filter", "some", "find"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "null và undefined khác nhau ở điểm nào?", answerText: "undefined là giá trị mặc định của biến chưa được gán; null là giá trị được gán tường minh để biểu thị 'không có gì'." },
      { type: "FLASHCARD", prompt: "Git commit là gì?", answerText: "Một 'ảnh chụp' (snapshot) các thay đổi đã được lưu vào lịch sử của repository, kèm một thông điệp mô tả." },
    ],
  },
  {
    slug: "cs-fundamentals",
    title: "Lập trình: Kiến thức nền CS",
    description: "Cấu trúc dữ liệu, thuật toán, Git, HTTP/API và database — kiến thức nền áp dụng được cho mọi ngôn ngữ lập trình.",
    tags: ["lap-trinh", "cau-truc-du-lieu", "thuat-toan", "git", "http", "database"],
    language: "vi",
    items: [
      { type: "FLASHCARD", prompt: "Big O là gì?", answerText: "Ký hiệu mô tả tốc độ tăng của thời gian chạy (hoặc bộ nhớ) của thuật toán theo kích thước dữ liệu đầu vào, khi dữ liệu rất lớn." },
      { type: "MULTIPLE_CHOICE", prompt: "Tìm kiếm nhị phân (binary search) trên mảng đã sắp xếp có độ phức tạp là gì?", options: ["O(n)", "O(log n)", "O(n^2)", "O(1)"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Stack và Queue khác nhau thế nào?", answerText: "Stack: vào sau ra trước (LIFO) — như chồng đĩa. Queue: vào trước ra trước (FIFO) — như hàng người xếp hàng." },
      { type: "FLASHCARD", prompt: "Hash table (bảng băm) hoạt động thế nào?", answerText: "Dùng một hàm băm (hash function) chuyển khoá (key) thành chỉ số trong mảng, cho phép tra cứu/thêm/xoá gần như O(1) trung bình." },
      { type: "MULTIPLE_CHOICE", prompt: "Thuật toán sắp xếp nào có độ phức tạp trung bình O(n log n)?", options: ["Bubble sort", "Merge sort", "Selection sort", "Insertion sort"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Cây nhị phân tìm kiếm (Binary Search Tree) có tính chất gì?", answerText: "Với mỗi node: mọi giá trị ở cây con trái nhỏ hơn node đó, mọi giá trị ở cây con phải lớn hơn node đó." },
      { type: "FLASHCARD", prompt: "REST API là gì?", answerText: "Một kiểu thiết kế API dựa trên HTTP, dùng các phương thức (GET, POST, PUT, DELETE) để thao tác trên 'tài nguyên' (resource), thường trả dữ liệu dạng JSON." },
      { type: "MULTIPLE_CHOICE", prompt: "Mã trạng thái HTTP nào nghĩa là 'không tìm thấy'?", options: ["200", "301", "404", "500"], correctIndex: 2 },
      { type: "FLASHCARD", prompt: "Idempotent (trong API) nghĩa là gì?", answerText: "Gọi cùng một request nhiều lần cho kết quả cuối giống như gọi một lần — ví dụ PUT/DELETE thường được thiết kế idempotent, POST thường không." },
      { type: "FLASHCARD", prompt: "Git branch dùng để làm gì?", answerText: "Tạo một 'nhánh' phát triển song song, tách biệt với nhánh chính (main), để thử tính năng mới mà không ảnh hưởng code đang chạy ổn định." },
      { type: "FLASHCARD", prompt: "Git merge và git rebase khác nhau ở điểm nào?", answerText: "Merge tạo một commit gộp, giữ nguyên lịch sử hai nhánh; rebase 'chuyển' các commit của nhánh hiện tại lên trên nhánh khác, tạo lịch sử thẳng (linear), không tạo merge commit." },
      { type: "MULTIPLE_CHOICE", prompt: "Trong SQL, loại JOIN nào chỉ lấy các dòng có khớp ở CẢ HAI bảng?", options: ["LEFT JOIN", "INNER JOIN", "FULL OUTER JOIN", "CROSS JOIN"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Index trong database dùng để làm gì?", answerText: "Cấu trúc dữ liệu phụ giúp truy vấn/tìm kiếm nhanh hơn (đổi lại tốn thêm bộ nhớ và làm chậm ghi/insert một chút)." },
      { type: "FLASHCARD", prompt: "Cache là gì và dùng khi nào?", answerText: "Lưu tạm kết quả đã tính/lấy trước đó ở nơi truy cập nhanh hơn — dùng khi dữ liệu ít đổi hoặc tốn công tính lại, giúp giảm tải và tăng tốc." },
      { type: "TRUE_FALSE", prompt: "Trong mô hình OSI, HTTP hoạt động ở tầng Application (tầng ứng dụng).", correct: true },
      { type: "FLASHCARD", prompt: "JWT (JSON Web Token) thường dùng để làm gì?", answerText: "Mã hoá thông tin xác thực người dùng (ví dụ userId, role) thành một chuỗi có ký (sign), gửi kèm request để server xác minh mà không cần tra session ở DB mỗi lần." },
      { type: "FLASHCARD", prompt: "CI/CD là viết tắt của gì?", answerText: "Continuous Integration / Continuous Deployment (hoặc Delivery) — tự động build, test và (tuỳ) triển khai code mỗi khi có thay đổi được đẩy lên." },
      { type: "MULTIPLE_CHOICE", prompt: "Cấu trúc dữ liệu nào phù hợp nhất để triển khai chức năng 'Undo' theo thứ tự ngược lại?", options: ["Queue", "Stack", "Hash table", "Array"], correctIndex: 1 },
    ],
  },
  {
    slug: "english-everyday",
    title: "Tiếng Anh: Từ vựng & giao tiếp cơ bản",
    description: "Từ vựng và mẫu câu tiếng Anh thông dụng trong công việc và đời sống hàng ngày, kèm ví dụ.",
    tags: ["tieng-anh", "tu-vung", "giao-tiep"],
    language: "en",
    items: [
      { type: "FLASHCARD", prompt: "Appointment", answerText: "Cuộc hẹn (thường với bác sĩ, đối tác...). Ví dụ: I have an appointment at 3 PM." },
      { type: "FLASHCARD", prompt: "Could you please...?", answerText: "Mẫu câu yêu cầu lịch sự. Ví dụ: Could you please send me the file?" },
      { type: "FLASHCARD", prompt: "I'm afraid...", answerText: "Mẫu câu dùng khi báo tin không vui một cách lịch sự. Ví dụ: I'm afraid I can't make it today." },
      { type: "FLASHCARD", prompt: "Reliable", answerText: "Đáng tin cậy, có thể tin tưởng được. Ví dụ: She's a reliable colleague." },
      { type: "FLASHCARD", prompt: "Deadline", answerText: "Hạn chót, thời điểm phải hoàn thành công việc. Ví dụ: The deadline is next Friday." },
      { type: "FLASHCARD", prompt: "To catch up", answerText: "Bắt kịp (công việc/tin tức), hoặc gặp lại nhau để nói chuyện. Ví dụ: Let's catch up over coffee." },
      { type: "FLASHCARD", prompt: "Overwhelmed", answerText: "Cảm giác quá tải, choáng ngợp. Ví dụ: I feel overwhelmed with all this work." },
      { type: "FLASHCARD", prompt: "To figure out", answerText: "Tìm ra, nghĩ ra cách giải quyết. Ví dụ: I need to figure out how this works." },
      { type: "FLASHCARD", prompt: "In the meantime", answerText: "Trong khi đó, trong lúc chờ đợi. Ví dụ: In the meantime, please review the document." },
      { type: "FLASHCARD", prompt: "To make sense", answerText: "Có lý, hợp lý, dễ hiểu. Ví dụ: Does this explanation make sense to you?" },
      { type: "FLASHCARD", prompt: "Straightforward", answerText: "Đơn giản, dễ hiểu, rõ ràng. Ví dụ: The instructions are straightforward." },
      { type: "FLASHCARD", prompt: "To bring up", answerText: "Nêu ra (một vấn đề/chủ đề) trong cuộc nói chuyện. Ví dụ: She brought up an interesting point." },
      { type: "FLASHCARD", prompt: "Worth it", answerText: "Đáng giá, xứng đáng (với công sức/tiền bỏ ra). Ví dụ: The trip was tiring but worth it." },
      { type: "FLASHCARD", prompt: "To get along with", answerText: "Hoà hợp, chơi hợp với ai đó. Ví dụ: I get along well with my teammates." },
      { type: "MULTIPLE_CHOICE", prompt: "Which sentence is grammatically correct?", options: ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."], correctIndex: 2 },
      { type: "MULTIPLE_CHOICE", prompt: "Choose the correct past tense of 'go'.", options: ["goed", "went", "gone", "going"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "How's it going?", answerText: "Câu hỏi thăm thân mật, nghĩa gần giống 'Bạn thế nào?'. Trả lời thường: Pretty good, thanks! / Not bad." },
      { type: "FLASHCARD", prompt: "To sort something out", answerText: "Giải quyết, xử lý xong một vấn đề. Ví dụ: I'll sort it out by tomorrow." },
    ],
  },
  {
    slug: "english-it",
    title: "Tiếng Anh: IT/Công nghệ",
    description: "Từ vựng tiếng Anh chuyên ngành IT hay gặp khi đọc tài liệu kỹ thuật, review code hoặc trao đổi với team.",
    tags: ["tieng-anh", "tu-vung", "it", "cong-nghe"],
    language: "en",
    items: [
      { type: "FLASHCARD", prompt: "Bug", answerText: "Lỗi trong phần mềm. Ví dụ: We found a bug in the login page." },
      { type: "FLASHCARD", prompt: "Feature", answerText: "Tính năng, chức năng của phần mềm/sản phẩm. Ví dụ: This new feature lets users upload photos." },
      { type: "FLASHCARD", prompt: "Deploy / Deployment", answerText: "Triển khai (đưa code lên môi trường chạy thật, ví dụ server production). Ví dụ: We deployed the update last night." },
      { type: "FLASHCARD", prompt: "Rollback", answerText: "Quay lại phiên bản trước (khi bản mới có lỗi). Ví dụ: We had to roll back the release." },
      { type: "FLASHCARD", prompt: "Endpoint", answerText: "Một 'địa chỉ' (URL) cụ thể của API mà client gọi tới. Ví dụ: The /users endpoint returns a list of users." },
      { type: "FLASHCARD", prompt: "Repository (repo)", answerText: "Nơi lưu trữ mã nguồn và lịch sử thay đổi của nó (thường qua Git). Ví dụ: Clone the repo to get started." },
      { type: "FLASHCARD", prompt: "Pull request (PR)", answerText: "Yêu cầu gộp thay đổi từ một nhánh vào nhánh khác, kèm cho người khác review trước khi merge." },
      { type: "FLASHCARD", prompt: "Merge conflict", answerText: "Xung đột khi Git không tự gộp được hai thay đổi trùng nhau trên cùng một đoạn code, cần người xử lý tay." },
      { type: "FLASHCARD", prompt: "Codebase", answerText: "Toàn bộ mã nguồn của một dự án/phần mềm." },
      { type: "FLASHCARD", prompt: "Backend / Frontend", answerText: "Backend: phần xử lý logic, dữ liệu ở server. Frontend: phần giao diện người dùng nhìn thấy và tương tác." },
      { type: "FLASHCARD", prompt: "Scalable", answerText: "Có khả năng mở rộng (chịu được tải lớn hơn khi cần) mà không phải viết lại từ đầu." },
      { type: "FLASHCARD", prompt: "Latency", answerText: "Độ trễ — thời gian từ khi gửi yêu cầu đến khi nhận được phản hồi." },
      { type: "FLASHCARD", prompt: "Throughput", answerText: "Lượng công việc/yêu cầu xử lý được trong một khoảng thời gian (ví dụ số request/giây)." },
      { type: "FLASHCARD", prompt: "Refactor", answerText: "Sửa lại cấu trúc code cho gọn/rõ hơn mà KHÔNG thay đổi hành vi bên ngoài của nó." },
      { type: "FLASHCARD", prompt: "Legacy code", answerText: "Code cũ, thường khó hiểu/khó sửa, nhưng vẫn đang được dùng trong hệ thống thật." },
      { type: "FLASHCARD", prompt: "Edge case", answerText: "Trường hợp hiếm/đặc biệt ở 'rìa' phạm vi bình thường, dễ bị bỏ sót khi lập trình. Ví dụ: an empty input list is an edge case." },
      { type: "MULTIPLE_CHOICE", prompt: "What does 'CI/CD' stand for?", options: ["Code Integration / Code Delivery", "Continuous Integration / Continuous Delivery", "Central Index / Central Database", "Client Interface / Client Design"], correctIndex: 1 },
      { type: "FLASHCARD", prompt: "Documentation (docs)", answerText: "Tài liệu hướng dẫn/giải thích cách dùng một thư viện, API hay hệ thống." },
    ],
  },
];

/** Tạo user hệ thống sở hữu nội dung (nếu thiếu) + các bộ học còn thiếu theo `slug`. Trả số bộ/mục vừa tạo (chạy lại = 0). */
export async function seedStudyLessons(client: PrismaClient): Promise<{ sets: number; items: number }> {
  const owner = await client.user.upsert({
    where: { email: CONTENT_OWNER_EMAIL },
    update: {},
    create: {
      email: CONTENT_OWNER_EMAIL,
      name: CONTENT_OWNER_NAME,
      normalizedName: normalizeSearch(CONTENT_OWNER_NAME),
      role: "user",
      status: "ACTIVE",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const existing = await client.studySet.findMany({ where: { ownerId: owner.id }, select: { tags: true } });
  const haveSlugs = new Set(existing.flatMap((s) => s.tags.filter((t) => t.startsWith("seed:")).map((t) => t.slice("seed:".length))));

  let sets = 0;
  let items = 0;
  for (const def of LESSON_SET_SEEDS) {
    if (haveSlugs.has(def.slug)) continue;

    const contents = def.items.map(buildItemContent);
    const set = await client.studySet.create({
      data: {
        ownerId: owner.id,
        title: def.title,
        normalizedTitle: normalizeSearch(def.title),
        description: def.description,
        tags: normalizeTags([...def.tags, `seed:${def.slug}`]),
        language: def.language,
        visibility: "PUBLIC",
        status: "ACTIVE",
        itemCount: contents.length,
        itemTypesMask: typesMask(contents.map((c) => c.type)),
        // Quy ước Mongo null-vs-absent (xem study-set.repository.prisma.ts#create): field lọc sau này bằng `{field: null}`
        // (listWhere() dùng `deletedAt: null` không điều kiện) phải ghi null TƯỜNG MINH, không thì bị loại khỏi mọi danh sách.
        hiddenReason: null,
        hiddenBy: null,
        hiddenAt: null,
        deletedAt: null,
      },
    });
    await client.studyItem.createMany({
      data: contents.map((content, index) => ({ ...content, setId: set.id, ownerId: owner.id, order: (index + 1) * 10 })),
    });
    sets += 1;
    items += contents.length;
  }
  return { sets, items };
}
