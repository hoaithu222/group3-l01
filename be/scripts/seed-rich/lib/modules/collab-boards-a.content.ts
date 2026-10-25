import { drawEntity } from "./collab-board-dsl";
import type { BoardSpec } from "./collab.types";

/** Bảng trắng của 4 nhóm: front-end, toán, dự án ứng dụng, IELTS, CTDL&GT. Màu là id token (ink, red, yellow, green, blue, purple). */

export const frontendBoards: readonly BoardSpec[] = [
  {
    name: "Cây component – Todo app (React)",
    by: "minhanh",
    drawers: ["minhanh", "thuytrang", "vietdung"],
    daysAgo: 9,
    editedDaysAgo: 3,
    background: "dots",
    history: [{ ratio: 0.5, kind: "MANUAL", label: "Bản vẽ trong buổi họp", by: "minhanh", daysAgo: 7 }],
    draw(b) {
      b.text("title", 0, -70, "Cây component – Todo app (React)", { size: 28 });
      b.node("app", 380, 0, 160, 56, "App", { fill: "purple" });
      b.node("hdr", 130, 140, 150, 52, "Header", { fill: "blue" });
      b.node("page", 375, 140, 170, 52, "TodoPage", { fill: "blue" });
      b.node("ftr", 640, 140, 150, 52, "Footer", { fill: "blue" });
      b.node("form", 170, 290, 180, 52, "AddTodoForm", { fill: "green" });
      b.node("tabs", 375, 290, 170, 52, "FilterTabs", { fill: "green" });
      b.node("list", 570, 290, 170, 52, "TodoList", { fill: "green" });
      b.node("item1", 500, 440, 150, 52, "TodoItem", { fill: "yellow" });
      b.node("item2", 680, 440, 150, 52, "TodoItem", { fill: "yellow" });
      for (const [id, from, to] of [["a1", "app", "hdr"], ["a2", "app", "page"], ["a3", "app", "ftr"], ["a4", "page", "form"], ["a5", "page", "tabs"], ["a6", "page", "list"], ["a7", "list", "item1"], ["a8", "list", "item2"]] as const) b.arrow(id, from, to);
      b.sticky("s-state", 20, 420, "State nằm ở TodoPage:\n• todos[]\n• filter", "yellow");
      b.sticky("s-props", 220, 420, "Props đi xuống:\nonAdd, onToggle,\nonDelete", "blue");
      b.sticky("s-key", 870, 280, "key = todo.id\n(không dùng index)", "red", { h: 110 });
    },
  },
];

export const mathBoards: readonly BoardSpec[] = [
  {
    name: "Chọn phương pháp tính tích phân",
    by: "thu",
    drawers: ["thu", "trungkien", "baotram"],
    daysAgo: 11,
    editedDaysAgo: 4,
    background: "grid",
    history: [{ ratio: 0.55, kind: "AUTO", daysAgo: 8 }],
    draw(b) {
      b.node("start", 300, 0, 320, 62, "∫ f(x) dx — chọn cách tính", { fill: "purple", shape: "ellipse" });
      const steps: Array<[string, string, string, string]> = [
        ["q1", "f(x) có trong bảng\nnguyên hàm cơ bản?", "a1", "Dùng bảng nguyên hàm"],
        ["q2", "Có dạng u(x)·v'(x)?\n(tích hai loại hàm)", "a2", "Từng phần:\n∫u dv = uv − ∫v du"],
        ["q3", "Có hàm hợp\nf(g(x))·g'(x)?", "a3", "Đổi biến t = g(x)"],
        ["q4", "Là phân thức hữu tỉ\nP(x)/Q(x)?", "a4", "Tách thành các phân thức\nđơn giản rồi lấy nguyên hàm"],
      ];
      steps.forEach(([q, qt, a, at], i) => {
        const y = 130 + i * 140;
        b.node(q, 320, y, 260, 76, qt, { fill: "yellow", size: 17 });
        b.node(a, 680, y + 2, 310, 72, at, { fill: "green", size: 16 });
        b.arrow(`yes${i}`, q, a);
        b.tag(`yes${i}-t`, `yes${i}`, "Có", { dy: -16, stroke: "green" });
      });
      b.arrow("s0", "start", "q1");
      for (let i = 0; i < 3; i++) {
        b.arrow(`no${i}`, steps[i][0], steps[i + 1][0]);
        b.tag(`no${i}-t`, `no${i}`, "Không", { dx: 34, stroke: "red" });
      }
      b.node("end", 320, 690, 260, 62, "Đạo hàm kết quả để kiểm tra lại", { fill: "blue", size: 17 });
      b.arrow("no3", "q4", "end");
      b.tag("no3-t", "no3", "Không", { dx: 34, stroke: "red" });
      b.sticky("s-liate", 20, 130, "Chọn u theo LIATE:\nLog – Ngược lượng giác – Đại số – Lượng giác – Mũ", "blue", { h: 170 });
      b.sticky("s-tip", 20, 340, "Thử theo thứ tự: bảng nguyên hàm → đổi biến → từng phần → phân thức", "yellow", { h: 130 });
    },
  },
];

export const appdevBoards: readonly BoardSpec[] = [
  {
    name: "Kiến trúc Tiêu Gọn",
    by: "thu",
    drawers: ["thu", "quocbao", "giahuy", "hoanglong"],
    daysAgo: 13,
    editedDaysAgo: 3,
    background: "grid",
    history: [{ ratio: 0.5, kind: "MANUAL", label: "Kiến trúc v1", by: "thu", daysAgo: 11 }],
    draw(b) {
      b.text("title", 0, -60, "Kiến trúc Tiêu Gọn", { size: 28 });
      b.rect("phone", 0, 0, 280, 340, { stroke: "blue" });
      b.text("phone-t", 20, 12, "Điện thoại — React Native + Expo", { size: 16, stroke: "blue" });
      b.node("sc1", 24, 50, 232, 46, "Đăng nhập / Đăng ký", { fill: "green", size: 16 });
      b.node("sc2", 24, 108, 232, 46, "Thêm khoản chi", { fill: "green", size: 16 });
      b.node("sc3", 24, 166, 232, 46, "Thống kê theo tuần", { fill: "green", size: 16 });
      b.node("store", 24, 234, 232, 40, "SecureStore: token", { fill: "yellow", size: 16 });
      b.node("queue", 24, 284, 232, 40, "Hàng đợi offline + retry", { fill: "yellow", size: 16 });
      b.rect("api", 440, 0, 300, 340, { stroke: "purple" });
      b.text("api-t", 460, 12, "API — Node.js / Express", { size: 16, stroke: "purple" });
      b.node("r", 464, 50, 252, 46, "Router /api/v1", { fill: "blue", size: 16 });
      b.node("mw", 464, 108, 252, 58, "Middleware: JWT, zod,\nrate limit, helmet", { fill: "yellow", size: 16 });
      b.node("svc", 464, 178, 252, 46, "Service + truy cập dữ liệu", { fill: "blue", size: 16 });
      b.node("job", 464, 238, 252, 46, "Job nhắc ghi chép mỗi tối", { fill: "purple", size: 16 });
      b.ellipse("db", 900, 110, 220, 110, { fill: "green" });
      b.label("db-t", "db", "MongoDB Atlas", { size: 18 });
      b.text("db-f", 905, 236, "users · transactions · categories", { size: 15 });
      b.node("push", 440, 440, 300, 60, "Expo Push Service", { fill: "yellow" });
      b.arrow("e1", "phone", "api");
      b.tag("e1-t", "e1", "HTTPS + JWT", { dy: -18, size: 15 });
      b.arrow("e2", "api", "db");
      b.tag("e2-t", "e2", "truy vấn", { dy: -18, size: 15 });
      b.arrow("e3", "api", "push");
      b.arrow("e4", "push", "phone", { stroke: "purple" });
      b.tag("e4-t", "e4", "thông báo nhắc", { dy: 18, dx: -30, size: 15 });
      b.sticky("s-next", 900, 330, "Vòng sau:\nquét hoá đơn,\nchia tiền nhóm", "yellow", { h: 130 });
    },
  },
  {
    name: "ERD Tiêu Gọn (MongoDB)",
    by: "quocbao",
    drawers: ["quocbao", "duyhung", "thu"],
    daysAgo: 11,
    editedDaysAgo: 2,
    background: "dots",
    history: [{ ratio: 0.6, kind: "AUTO", daysAgo: 6 }],
    draw(b) {
      b.text("title", 0, -60, "ERD Tiêu Gọn", { size: 28 });
      drawEntity(b, "users", 0, 140, "users", ["_id", "email (unique)", "name", "passwordHash", "createdAt"], "blue");
      drawEntity(b, "tx", 400, 0, "transactions", ["_id", "userId", "categoryId", "clientId", "type  INCOME | EXPENSE", "amount  (số nguyên, đồng)", "note  (≤ 200 ký tự)", "occurredAt"], "purple");
      drawEntity(b, "cat", 400, 330, "categories", ["_id", "userId", "name", "icon", "type"], "green");
      drawEntity(b, "bud", 800, 330, "budgets", ["_id", "userId", "categoryId", "month", "limitAmount"], "yellow");
      b.arrow("r1", "users", "tx");
      b.tag("r1-1", "r1", "1", { at: 0.12, dy: -16 });
      b.tag("r1-n", "r1", "N", { at: 0.88, dy: -16 });
      b.arrow("r2", "cat", "tx");
      b.tag("r2-1", "r2", "1", { at: 0.15, dx: -14 });
      b.tag("r2-n", "r2", "N", { at: 0.85, dx: -14 });
      b.arrow("r3", "users", "cat");
      b.tag("r3-1", "r3", "1", { at: 0.12, dy: 16 });
      b.tag("r3-n", "r3", "N", { at: 0.88, dy: 16 });
      b.arrow("r4", "cat", "bud");
      b.tag("r4-1", "r4", "1", { at: 0.15, dy: -16 });
      b.tag("r4-n", "r4", "N", { at: 0.85, dy: -16 });
      b.sticky("s-idx", 800, 20, "Index:\n(userId, occurredAt, _id)\ncho danh sách cursor.\nUnique (userId, clientId)\nchống tạo trùng.", "yellow", { w: 230, h: 190, size: 15 });
    },
  },
];

export const ieltsBoards: readonly BoardSpec[] = [
  {
    name: "Cấu trúc bài Writing Task 2",
    by: "thu",
    drawers: ["thu", "mentorha", "camtu", "anhthu"],
    daysAgo: 14,
    editedDaysAgo: 5,
    background: "dots",
    history: [{ ratio: 0.6, kind: "MANUAL", label: "Bản cô Hà chỉnh", by: "mentorha", daysAgo: 10 }],
    draw(b) {
      b.text("title", 0, -60, "Cấu trúc bài Writing Task 2 (Opinion)", { size: 28 });
      const parts: Array<[string, string, string, "green" | "blue" | "purple", string]> = [
        ["p1", "Mở bài", "1. Paraphrase đề bằng từ đồng nghĩa\n2. Nêu rõ quan điểm (thesis) — 2 đến 3 câu", "green", "i1"],
        ["p2", "Thân bài 1", "Topic sentence → giải thích → ví dụ cụ thể\n(1 ý chính cho mỗi đoạn)", "blue", "i2"],
        ["p3", "Thân bài 2", "Ý thứ hai hoặc nhượng bộ (\"Admittedly…\")\n→ giải thích → ví dụ", "blue", "i3"],
        ["p4", "Kết bài", "Nhắc lại quan điểm bằng từ ngữ khác\nKhông thêm ý mới", "purple", "i4"],
      ];
      parts.forEach(([id, name, detail, tone, info], i) => {
        const y = i * 130;
        b.node(id, 0, y, 200, 76, name, { fill: tone, size: 20 });
        b.rect(info, 260, y, 440, 76);
        b.text(`${info}-t`, 276, y + 14, detail, { size: 16 });
        b.arrow(`ar-${id}`, id, info);
        if (i > 0) b.arrow(`down-${id}`, parts[i - 1][0], id);
      });
      b.sticky("s-time", 780, 0, "Thời gian 40 phút:\n5' dàn ý\n30' viết\n5' soát lỗi", "yellow", { h: 140 });
      b.sticky("s-crit", 780, 170, "Tiêu chí chấm:\nTR · CC · LR · GRA\n(mỗi tiêu chí 25%)", "blue", { h: 130 });
      b.sticky("s-err", 780, 330, "Lỗi hay gặp:\nmạo từ, thì,\nsố ít / số nhiều", "red", { h: 130 });
    },
  },
];

export const dsaBoards: readonly BoardSpec[] = [
  {
    name: "Chọn cấu trúc dữ liệu nào?",
    by: "thu",
    drawers: ["thu", "haidang", "minhkhoi", "tuankiet"],
    daysAgo: 12,
    editedDaysAgo: 3,
    background: "grid",
    history: [{ ratio: 0.5, kind: "AUTO", daysAgo: 8 }],
    draw(b) {
      b.node("root", 300, 0, 440, 70, "Bài toán cần lưu và truy xuất dữ liệu", { fill: "purple", shape: "ellipse", size: 17 });
      b.node("q1", 0, 150, 240, 84, "Tra cứu theo khoá\nphải thật nhanh?", { fill: "yellow", size: 17 });
      b.node("q2", 380, 150, 280, 84, "Cần lấy min / max\nhoặc duyệt có thứ tự?", { fill: "yellow", size: 17 });
      b.node("q3", 800, 150, 280, 84, "Thêm / xoá theo\nthứ tự vào – ra?", { fill: "yellow", size: 17 });
      b.arrow("t1", "root", "q1");
      b.arrow("t2", "root", "q2");
      b.arrow("t3", "root", "q3");
      b.node("hash", 0, 320, 240, 84, "Hash table\ntra cứu O(1) trung bình", { fill: "green", size: 17 });
      b.node("heap", 300, 320, 220, 84, "Heap / Priority Queue\nlấy min-max O(log n)", { fill: "green", size: 16 });
      b.node("bst", 550, 320, 220, 84, "BST cân bằng\nduyệt thứ tự O(log n)", { fill: "green", size: 16 });
      b.node("stack", 800, 320, 130, 84, "Stack\n(LIFO)", { fill: "green", size: 17 });
      b.node("queue", 950, 320, 130, 84, "Queue\n(FIFO)", { fill: "green", size: 17 });
      for (const [id, from, to] of [["g1", "q1", "hash"], ["g2", "q2", "heap"], ["g3", "q2", "bst"], ["g4", "q3", "stack"], ["g5", "q3", "queue"]] as const) b.arrow(id, from, to);
      b.tag("g1-t", "g1", "Có", { dx: 22, stroke: "green" });
      b.tag("g2-t", "g2", "Min-max", { dx: -42, dy: -4, size: 14 });
      b.tag("g3-t", "g3", "Thứ tự", { dx: 40, dy: -4, size: 14 });
      b.tag("g4-t", "g4", "Ra sau cùng", { dx: -52, size: 14 });
      b.tag("g5-t", "g5", "Ra đầu tiên", { dx: 56, size: 14 });
      b.sticky("s1", 0, 470, "Mảng: truy cập theo chỉ số O(1), chèn giữa O(n)", "blue", { h: 120 });
      b.sticky("s2", 200, 470, "Danh sách liên kết: chèn/xoá đầu O(1), truy cập O(n)", "blue", { h: 120 });
      b.sticky("s3", 400, 470, "Đồ thị: BFS/DFS O(V + E); Dijkstra O((V + E) log V)", "purple", { h: 120 });
    },
  },
  {
    name: "Ví dụ chạy Dijkstra từ đỉnh A",
    by: "minhkhoi",
    drawers: ["minhkhoi", "thu", "haidang"],
    daysAgo: 8,
    editedDaysAgo: 2,
    background: "dots",
    history: [{ ratio: 0.7, kind: "MANUAL", label: "Trước khi thêm bảng bước", by: "minhkhoi", daysAgo: 5 }],
    draw(b) {
      const pos: Record<string, [number, number]> = { A: [0, 170], B: [230, 40], C: [230, 300], D: [470, 40], E: [470, 300], F: [710, 170] };
      const edges: Array<[string, string, number]> = [["A", "B", 4], ["A", "C", 2], ["B", "C", 1], ["B", "D", 5], ["C", "D", 8], ["C", "E", 10], ["D", "E", 2], ["D", "F", 6], ["E", "F", 3]];
      b.text("title", 0, -60, "Dijkstra từ đỉnh A", { size: 28 });
      for (const [u, v, w] of edges) {
        b.line(`e-${u}${v}`, pos[u][0] + 35, pos[u][1] + 35, pos[v][0] + 35, pos[v][1] + 35);
        b.tag(`w-${u}${v}`, `e-${u}${v}`, String(w), { size: 20, stroke: "red", dy: -14, dx: 12 });
      }
      const dist: Record<string, string> = { A: "0", C: "2", B: "3", D: "8", E: "10", F: "13" };
      for (const [name, [x, y]] of Object.entries(pos)) {
        b.node(`n-${name}`, x, y, 70, 70, name, { fill: name === "A" ? "purple" : "blue", shape: "ellipse", size: 22 });
        b.text(`d-${name}`, x + 18, name === "B" || name === "D" ? y - 28 : y + 78, `d=${dist[name]}`, { size: 16, stroke: "green" });
      }
      b.sticky("s-steps", 880, 0, "Thứ tự chốt đỉnh:\n1) A = 0\n2) C = 2\n3) B = 3 (qua C)\n4) D = 8 (qua B)\n5) E = 10 (qua D)\n6) F = 13 (qua E)", "green", { w: 210, h: 230, size: 15 });
      b.sticky("s-path", 880, 260, "Đường ngắn nhất A → F:\nA → C → B → D → E → F\n= 2 + 1 + 5 + 2 + 3 = 13", "yellow", { w: 210, h: 160, size: 15 });
    },
  },
];
