import type { WorkspaceResources } from "../media/types";

/**
 * Kho tài liệu (Resource Hub) của 8 nhóm làm việc: thư mục + tệp (slide PDF, tài liệu docx, bảng xlsx, poster PNG, văn bản và mã mẫu).
 * Khoá của `RESOURCES` trùng `WorkspaceSpec.key`. Người tải lên (`by`) đều là thành viên nhóm đó.
 */

/** Ghép các dòng thành nội dung tệp, kết thúc bằng xuống dòng (dùng cho .md). */
const L = (...rows: string[]): string => rows.join("\n") + "\n";

/** Giữ nguyên khối mã/dữ liệu viết trong template literal (dùng chuỗi raw), bỏ dòng trống đầu và khoảng trắng cuối. */
const C = (strings: TemplateStringsArray): string => strings.raw.join("").replace(/^\n/, "").replace(/\s+$/, "") + "\n";

const frontend: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Code mẫu" },
    { name: "Tài liệu tham khảo" },
    { name: "Cheat sheet", parent: "Tài liệu tham khảo" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-tuan-1-html-css.pdf",
      by: "minhanh",
      description: "Slide tuần 1–2: HTML ngữ nghĩa, box model, specificity, flexbox, grid và responsive.",
      tags: ["html", "css", "tuan-1"],
      theme: "ocean",
      slides: [
        {
          title: "HTML/CSS căn bản — Tuần 1–2",
          bullets: [
            "Mục tiêu: dựng landing page responsive",
            "Chỉ dùng HTML và CSS thuần, chưa dùng framework",
            "Công cụ: VS Code, Live Server, DevTools",
            "Nộp bài: link CodePen hoặc GitHub Pages",
          ],
        },
        {
          title: "Semantic HTML",
          bullets: [
            "header, nav, main, article, section, footer",
            "Mỗi trang chỉ nên có một thẻ main",
            "section nên có heading; div chỉ để gom bố cục",
            "Ảnh luôn có alt cho trợ năng và SEO",
          ],
        },
        {
          title: "Box model",
          bullets: [
            "content → padding → border → margin",
            "box-sizing: border-box tính cả padding và border vào width",
            "Đặt * { box-sizing: border-box } ở đầu file CSS",
            "Margin dọc của hai khối liền kề có thể gộp lại",
          ],
        },
        {
          title: "Specificity",
          bullets: [
            "inline style > #id > .class/[attr]/:pseudo-class > thẻ",
            "Bằng nhau thì khai báo sau thắng",
            "Hạn chế !important và selector lồng sâu",
            "Đặt tên class ngắn theo khối, vd .card__title",
          ],
        },
        {
          title: "Flexbox",
          bullets: [
            "display: flex bật flex container",
            "justify-content căn theo trục chính",
            "align-items căn theo trục phụ",
            "gap đặt khoảng cách; flex-wrap cho phép xuống dòng",
            "flex: 1 cho phần tử giãn ra chiếm phần còn lại",
          ],
        },
        {
          title: "CSS Grid",
          bullets: [
            "display: grid kèm grid-template-columns",
            "repeat(3, 1fr) chia ba cột bằng nhau",
            "gap thay cho margin giữa các ô",
            "place-items: center căn giữa cả hai chiều",
            "grid-template-areas để dựng layout nhiều vùng",
          ],
        },
        {
          title: "Responsive mobile-first",
          bullets: [
            "Viết CSS cho màn hình nhỏ trước",
            "Mở rộng bằng @media (min-width: 768px)",
            "Thẻ meta viewport là bắt buộc cho di động",
            "Dùng rem, % và clamp() thay cho px cố định",
            "Kiểm tra ở 375px, 768px và 1280px",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-tuan-5-react-co-ban.pdf",
      by: "mentorson",
      description: "Slide tuần 5–6: component, props, state, useEffect và quy tắc của Hooks.",
      tags: ["react", "hooks", "tuan-5"],
      theme: "violet",
      slides: [
        {
          title: "React cơ bản — Tuần 5–6",
          bullets: [
            "Học theo phần Learn của react.dev",
            "Khởi tạo dự án bằng Vite",
            "Bài tập: app đếm ngược Pomodoro",
            "Hạn nộp: Chủ nhật tuần 6",
          ],
        },
        {
          title: "Component và props",
          bullets: [
            "Component là hàm trả về JSX",
            "Tên component viết hoa chữ cái đầu",
            "Props truyền từ cha xuống con, chỉ đọc",
            "Tách UI thành các component nhỏ, tái sử dụng được",
          ],
        },
        {
          title: "State với useState",
          bullets: [
            "const [count, setCount] = useState(0)",
            "Đổi state bằng setter, không sửa trực tiếp",
            "State trong một lần render là snapshot cố định",
            "Cập nhật theo giá trị cũ: setCount(c => c + 1)",
          ],
        },
        {
          title: "Danh sách và key",
          bullets: [
            "Dùng items.map để render danh sách",
            "key giúp React nhận diện từng phần tử",
            "key phải ổn định và duy nhất giữa các phần tử cùng cấp",
            "Tránh dùng index nếu danh sách đổi thứ tự",
          ],
        },
        {
          title: "useEffect",
          bullets: [
            "Chạy tác dụng phụ sau render: API, timer, sự kiện",
            "Mảng phụ thuộc quyết định khi nào effect chạy lại",
            "[] nghĩa là chỉ chạy sau lần render đầu tiên",
            "Quên mảng phụ thuộc có thể gọi API lặp vô hạn",
          ],
        },
        {
          title: "Cleanup và Pomodoro",
          bullets: [
            "return () => clearInterval(id) trong useEffect",
            "Cleanup chạy trước lần effect kế tiếp và khi unmount",
            "Dùng functional update để timer không giữ state cũ",
            "Thêm nút bắt đầu, tạm dừng và đặt lại",
          ],
        },
        {
          title: "Quy tắc của Hooks",
          bullets: [
            "Chỉ gọi Hook ở cấp cao nhất của component",
            "Không gọi Hook trong vòng lặp hay điều kiện",
            "Tên custom Hook bắt đầu bằng use",
            "Bật eslint-plugin-react-hooks để bắt lỗi sớm",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Tài liệu tham khảo",
      name: "de-cuong-lo-trinh-8-tuan.docx",
      by: "haidang",
      description: "Đề cương lộ trình tự học front-end 8 tuần: mục tiêu, nội dung từng tuần và cách nộp bài.",
      tags: ["lo-trinh", "de-cuong"],
      title: "Đề cương lộ trình Front-end 8 tuần",
      sections: [
        {
          heading: "1. Mục tiêu",
          paragraphs: [
            "Sau 8 tuần, mỗi thành viên tự dựng được một trang web hoàn chỉnh bằng React, đưa lên Vercel và trình bày được cách mình làm.",
            "Nhóm ưu tiên làm bài tập thực tế hơn là xem video: khoảng 70% thời gian làm, 30% thời gian đọc.",
          ],
        },
        {
          heading: "2. Nội dung từng tuần",
          bullets: [
            "Tuần 1–2: HTML ngữ nghĩa, CSS, flexbox, grid, responsive; bài tập landing page",
            "Tuần 3–4: JavaScript ES6+, DOM, localStorage, fetch; bài tập Todo app và API thời tiết",
            "Tuần 5–6: React, props, state, useEffect; bài tập app đếm ngược Pomodoro",
            "Tuần 7–8: mini project portfolio, deploy lên Vercel và buổi tổng kết",
          ],
        },
        {
          heading: "3. Cách nộp và review bài",
          bullets: [
            "Nộp link repo GitHub hoặc CodePen ở kênh Bài tập tuần trước 21h Chủ nhật",
            "Mỗi người xem và bình luận ít nhất 2 bài của bạn khác",
            "Mentor review kỹ theo checklist: đặt tên, cấu trúc HTML, tái sử dụng CSS, a11y cơ bản",
            "Trễ hạn tối đa 1 ngày thì báo trước trong nhóm",
          ],
        },
        {
          heading: "4. Tài nguyên chính",
          bullets: [
            "MDN Web Docs (https://developer.mozilla.org) cho HTML, CSS và JavaScript",
            "React docs (https://react.dev) cho phần React",
            "Node.js (https://nodejs.org) để chạy công cụ và server tĩnh",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Tài liệu tham khảo",
      name: "bang-theo-doi-bai-tap.xlsx",
      by: "ngocdiep",
      description: "Bảng theo dõi hạn nộp, người review và trạng thái bài tập từng tuần.",
      tags: ["bai-tap", "tien-do"],
      sheetName: "Bài tập",
      rows: [
        ["Tuần", "Bài tập", "Hạn nộp", "Người review", "Trạng thái"],
        ["1", "Cài môi trường: VS Code, Node.js, Git", "Chủ nhật tuần 1", "Diệp", "Hoàn thành"],
        ["1–2", "Landing page bằng HTML/CSS thuần", "Chủ nhật tuần 2, 21h", "Minh Anh", "Đã review"],
        ["2", "Flexbox và Grid: dựng 10 layout", "Chủ nhật tuần 2", "Việt Dũng", "Đang review"],
        ["3", "Todo app bằng JavaScript thuần", "Chủ nhật tuần 3", "Anh Sơn", "Đang làm"],
        ["4", "Gọi API thời tiết bằng fetch", "Chủ nhật tuần 4", "Việt Dũng", "Chưa bắt đầu"],
        ["4", "Debounce ô tìm kiếm bằng closure", "Chủ nhật tuần 4", "Gia Huy", "Chưa bắt đầu"],
        ["5–6", "App đếm ngược Pomodoro bằng React", "Chủ nhật tuần 6", "Minh Anh", "Chưa bắt đầu"],
        ["7–8", "Mini project portfolio và deploy Vercel", "Chủ nhật tuần 8", "Anh Sơn", "Chưa bắt đầu"],
      ],
    },
    {
      kind: "poster",
      folder: "Cheat sheet",
      name: "cheat-sheet-flexbox.png",
      by: "khanhlinh",
      description: "Cheat sheet Flexbox một trang: trục chính, trục phụ, wrap, gap và co giãn.",
      tags: ["flexbox", "css", "cheat-sheet"],
      poster: {
        title: "Cheat sheet Flexbox",
        subtitle: "Căn chỉnh theo một chiều trong CSS",
        theme: "ocean",
        sections: [
          {
            head: "Bật flex",
            lines: ["display: flex;", "Các con trực tiếp thành flex item", "flex-direction: row | column", "Mặc định là row: trục chính nằm ngang"],
          },
          {
            head: "Trục chính",
            lines: ["justify-content: flex-start", "center | flex-end | space-between", "space-around | space-evenly", "Căn theo hướng flex-direction"],
          },
          {
            head: "Trục phụ",
            lines: ["align-items: stretch (mặc định)", "center | flex-start | flex-end", "align-self cho riêng từng item", "Container cần có chiều cao"],
          },
          {
            head: "Xuống dòng và khoảng cách",
            lines: ["flex-wrap: wrap;", "gap: 16px; thay cho margin", "row-gap và column-gap", "align-content khi có nhiều dòng"],
          },
          {
            head: "Co giãn item",
            lines: ["flex: 1; chia đều phần còn lại", "flex-grow: tỉ lệ giãn ra", "flex-shrink: tỉ lệ co lại", "flex-basis: kích thước ban đầu"],
          },
          {
            head: "Mẹo hay dùng",
            lines: ["Căn giữa: justify-content + align-items", "Sticky footer: main { flex: 1 }", "Navbar: logo có margin-right: auto", "Chữ dài tràn item: min-width: 0"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Tài liệu tham khảo",
      name: "lo-trinh-front-end-8-tuan.png",
      by: "thuytrang",
      description: "Poster lộ trình 8 tuần: HTML/CSS, JavaScript, React và dự án cuối khoá.",
      tags: ["lo-trinh", "poster"],
      poster: {
        title: "Lộ trình Front-end 8 tuần",
        subtitle: "HTML/CSS → JavaScript → React → Deploy",
        theme: "sunset",
        sections: [
          {
            head: "Tuần 1–2: HTML và CSS",
            lines: ["Semantic HTML, form, bảng", "Box model, specificity", "Flexbox, Grid, responsive", "Bài tập: landing page"],
          },
          {
            head: "Tuần 3–4: JavaScript",
            lines: ["ES6: let/const, arrow, destructuring", "DOM, sự kiện, localStorage", "Promise, async/await, fetch", "Bài tập: Todo và API thời tiết"],
          },
          {
            head: "Tuần 5–6: React",
            lines: ["Component, props, state", "useEffect và hàm cleanup", "Render danh sách, key, form", "Bài tập: app Pomodoro"],
          },
          {
            head: "Tuần 7–8: Dự án",
            lines: ["Mini project portfolio", "Deploy lên Vercel", "Review code cùng mentor", "Họp tổng kết cuối khoá"],
          },
          {
            head: "Thói quen mỗi ngày",
            lines: ["2 pomodoro: 1 đọc, 1 làm", "70% làm, 30% đọc", "Tự debug 15 phút rồi mới hỏi", "Commit nhỏ, message rõ ràng"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Cheat sheet",
      name: "Cheat sheet CSS specificity.md",
      by: "khanhlinh",
      description: "Tóm tắt cách tính độ ưu tiên của selector CSS, box model và các đơn vị thường dùng.",
      tags: ["css", "specificity", "box-model"],
      body: L(
        "# Cheat sheet CSS: specificity, box model, đơn vị",
        "",
        "## 1. Độ ưu tiên (specificity)",
        "Trình duyệt so sánh từ trái sang phải, bộ đếm nào lớn hơn thì thắng.",
        "",
        "| Loại selector | Ví dụ | Tính vào |",
        "| --- | --- | --- |",
        "| inline style | `style=\"...\"` | mức cao nhất (trước cả id) |",
        "| id | `#card` | cột id |",
        "| class, thuộc tính, pseudo-class | `.card`, `[type=text]`, `:hover` | cột class |",
        "| thẻ, pseudo-element | `p`, `::before` | cột thẻ |",
        "",
        "Ví dụ (id-class-thẻ):",
        "- `p` → 0-0-1",
        "- `p.title` → 0-1-1",
        "- `.card p` → 0-1-1 (bằng nhau thì khai báo sau thắng)",
        "- `#card p` → 1-0-1 (thắng cả hai dòng trên)",
        "",
        "Ghi nhớ: `!important` vượt trên mọi thứ nên hạn chế dùng. `:where()` có độ ưu tiên bằng 0.",
        "",
        "## 2. Box model",
        "content → padding → border → margin",
        "",
        "```css",
        "*, *::before, *::after { box-sizing: border-box; }",
        "```",
        "Với `border-box`, width/height đã gồm padding và border.",
        "",
        "## 3. Đơn vị hay dùng",
        "- `rem`: theo font-size của thẻ `html` (thường 16px) — dùng cho font và khoảng cách",
        "- `em`: theo font-size của chính phần tử — hợp với padding nút co theo chữ",
        "- `%`, `vw`, `vh`: theo kích thước cha hoặc khung nhìn",
        "- `clamp(1rem, 2.5vw, 1.5rem)`: cỡ chữ tự co giãn trong khoảng cho trước",
        "",
        "## 4. Mẹo debug",
        "- Mở DevTools, tab Elements → Computed để xem giá trị cuối cùng",
        "- Tạm thêm `outline: 1px solid red` để thấy kích thước thật của khối",
      ),
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "bai-tap-todo.js",
      by: "vietdung",
      description: "Logic Todo app tách khỏi giao diện, chạy thử được bằng Node với localStorage giả lập.",
      tags: ["javascript", "todo", "localstorage"],
      body: C`
// Bài tập tuần 3–4: logic của Todo app, chạy được bằng Node (không cần trình duyệt).
// Tách "dữ liệu" khỏi "giao diện" để dễ kiểm tra; phần DOM chỉ việc gọi các hàm này.

function createTodoList(storage) {
  // storage có getItem/setItem (trong trình duyệt chính là localStorage)
  let items = JSON.parse(storage.getItem("todos") || "[]");
  let nextId = items.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const save = () => storage.setItem("todos", JSON.stringify(items));

  return {
    add(title) {
      const text = String(title).trim();
      if (!text) return null; // bỏ qua chuỗi rỗng
      const todo = { id: nextId++, title: text, done: false };
      items.push(todo);
      save();
      return todo;
    },
    toggle(id) {
      const todo = items.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
      save();
    },
    remove(id) {
      items = items.filter((t) => t.id !== id);
      save();
    },
    list(filter = "all") {
      if (filter === "active") return items.filter((t) => !t.done);
      if (filter === "done") return items.filter((t) => t.done);
      return [...items];
    },
  };
}

// --- Chạy thử: giả lập localStorage bằng Map ---
const map = new Map();
const fakeStorage = {
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => map.set(k, v),
};

const todos = createTodoList(fakeStorage);
todos.add("Học flexbox");
todos.add("   "); // bị bỏ qua
const t = todos.add("Làm Todo app");
todos.toggle(t.id);

console.log("Đang làm:", todos.list("active").map((x) => x.title));
console.log("Đã xong:", todos.list("done").map((x) => x.title));
console.assert(todos.list().length === 2, "phải có 2 việc");
console.assert(createTodoList(fakeStorage).list("done").length === 1, "dữ liệu phải được lưu");
// Khi gắn vào DOM nhớ dùng textContent, không dùng innerHTML để tránh XSS.
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "debounce.js",
      by: "giahuy",
      description: "Hàm debounce viết bằng closure để giảm số lần gọi API khi người dùng gõ tìm kiếm.",
      tags: ["javascript", "closure", "debounce"],
      body: C`
// Debounce: chỉ chạy hàm sau khi người dùng NGỪNG gõ một khoảng thời gian (delay).
// Ý tưởng: closure giữ lại biến timerId giữa các lần gọi.

function debounce(fn, delay) {
  let timerId = null; // được closure "nhớ" qua các lần gọi
  return function (...args) {
    clearTimeout(timerId); // huỷ lần hẹn giờ trước đó
    timerId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Throttle (bản đơn giản): tối đa 1 lần chạy trong mỗi "limit" mili giây.
function throttle(fn, limit) {
  let lastRun = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      lastRun = now;
      fn.apply(this, args);
    }
  };
}

// --- Chạy thử: gõ "hà nội" từng ký tự, mỗi 100ms ---
let calls = 0;
const search = debounce((keyword) => {
  calls++;
  console.log("Gọi API với từ khoá:", keyword);
}, 300);

const typed = ["h", "hà", "hà n", "hà nội"];
typed.forEach((text, i) => setTimeout(() => search(text), i * 100));

setTimeout(() => {
  console.log("Số lần gọi API:", calls); // chỉ 1 lần thay vì 4
  console.assert(calls === 1, "debounce phải gộp thành 1 lần gọi");
}, 1000);

// Trong React: tạo hàm debounce bên trong useMemo/useRef hoặc debounce giá trị
// bằng useEffect + setTimeout (nhớ clearTimeout ở hàm cleanup).
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "flexbox-layout-mau.css",
      by: "thanhtung",
      description: "CSS mẫu cho navbar, lưới thẻ responsive, sticky footer và hiệu ứng hover mượt.",
      tags: ["css", "flexbox", "grid"],
      body: C`
/* Layout mẫu: navbar, lưới thẻ, sticky footer. Dùng flexbox và grid, viết theo mobile-first. */
*, *::before, *::after { box-sizing: border-box; }

:root {
  --primary: #0b6bcb;
  --space: 1rem;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex; /* sticky footer: body là một cột flex */
  flex-direction: column;
  font-family: system-ui, sans-serif;
}
main {
  flex: 1; /* chiếm hết chỗ trống, đẩy footer xuống đáy */
  padding: var(--space);
}

.navbar {
  display: flex;
  align-items: center;
  gap: var(--space);
  padding: 0.75rem var(--space);
}
.navbar .logo {
  margin-right: auto; /* đẩy các link còn lại sang phải */
}

/* Lưới thẻ: tự chia số cột theo bề rộng, không cần media query */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space);
}
.card {
  padding: var(--space);
  border: 1px solid #d0d7de;
  border-radius: 12px;
  transition: transform 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
}

h1 {
  font-size: clamp(1.5rem, 4vw, 2.5rem);
}
:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
`,
    },
    {
      kind: "text",
      folder: "Code mẫu",
      name: "thanh-pho-mau.csv",
      by: "tuankiet",
      description: "Danh sách thành phố kèm vĩ độ, kinh độ để thử gọi API thời tiết trong bài tập tuần 4.",
      tags: ["csv", "du-lieu-mau", "api"],
      body: C`
ten,vi_do,kinh_do
Hà Nội,21.0278,105.8342
TP. Hồ Chí Minh,10.8231,106.6297
Đà Nẵng,16.0544,108.2022
Huế,16.4637,107.5909
Hải Phòng,20.8449,106.6881
Cần Thơ,10.0452,105.7469
Nha Trang,12.2388,109.1967
Đà Lạt,11.9404,108.4583
`,
    },
  ],
};

const math: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Đề thi & lời giải" },
    { name: "Bảng công thức" },
    { name: "Code mẫu" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-gioi-han-va-dao-ham.pdf",
      by: "gvhung",
      description: "Slide Giải tích 1: giới hạn đáng nhớ, quy tắc đạo hàm, L'Hôpital và khảo sát hàm số.",
      tags: ["giai-tich", "gioi-han", "dao-ham"],
      theme: "amber",
      slides: [
        {
          title: "Giải tích 1 — Giới hạn và đạo hàm",
          bullets: [
            "Ôn thi cuối kỳ: ba nhóm kiến thức trọng tâm",
            "Giới hạn và liên tục",
            "Đạo hàm và ứng dụng",
            "Tích phân và chuỗi số ở buổi sau",
          ],
        },
        {
          title: "Giới hạn đáng nhớ (x → 0)",
          bullets: [
            "sin x / x → 1",
            "(eˣ − 1) / x → 1 và ln(1 + x) / x → 1",
            "sin(ax) / (bx) → a/b",
            "(1 − cos x) / x² → 1/2",
          ],
        },
        {
          title: "Dạng vô định 1^∞",
          bullets: [
            "lim (1 + u)^(1/u) = e khi u → 0",
            "Ví dụ: lim (1 + 2x)^(1/x) = e² khi x → 0",
            "Đưa về dạng (1 + u)^(1/u) rồi nhân mũ cho khớp",
            "Luôn xác định dạng vô định trước khi áp dụng",
          ],
        },
        {
          title: "Bảng đạo hàm cơ bản",
          bullets: [
            "(xⁿ)' = n·xⁿ⁻¹ ; (eˣ)' = eˣ ; (aˣ)' = aˣ·ln a",
            "(ln x)' = 1/x ; (sin x)' = cos x ; (cos x)' = −sin x",
            "(tan x)' = 1/cos²x ; (arctan x)' = 1/(1 + x²)",
            "(arcsin x)' = 1/√(1 − x²)",
          ],
        },
        {
          title: "Quy tắc đạo hàm",
          bullets: [
            "(u ± v)' = u' ± v'",
            "(u·v)' = u'v + uv'",
            "(u/v)' = (u'v − uv') / v²",
            "Hàm hợp: [f(g(x))]' = f'(g(x))·g'(x)",
            "Dạng u^v: lấy logarit, vd (xˣ)' = xˣ(ln x + 1)",
          ],
        },
        {
          title: "Quy tắc L'Hôpital",
          bullets: [
            "Áp dụng cho dạng 0/0 hoặc ∞/∞",
            "lim f/g = lim f'/g' nếu giới hạn bên phải tồn tại",
            "Nếu lim f'/g' không tồn tại thì chưa kết luận được",
            "Ví dụ: lim (x + sin x)/x = 1 khi x → ∞, tính trực tiếp",
            "Ghi rõ dạng vô định mỗi lần dùng",
          ],
        },
        {
          title: "Ứng dụng: cực trị và khảo sát hàm số",
          bullets: [
            "f'(x) = 0 là điểm nghi ngờ cực trị",
            "f' đổi dấu từ + sang − : cực đại",
            "Tại điểm dừng, f'' > 0: cực tiểu; f'' < 0: cực đại",
            "f'' đổi dấu: điểm uốn",
            "Lập bảng biến thiên rồi mới kết luận",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-xac-suat-co-dieu-kien-bayes.pdf",
      by: "tanphat",
      description: "Slide xác suất có điều kiện, xác suất toàn phần, công thức Bayes và phân phối chuẩn.",
      tags: ["xac-suat", "bayes", "phan-phoi"],
      theme: "forest",
      slides: [
        {
          title: "Xác suất có điều kiện và Bayes",
          bullets: [
            "Biến cố và các công thức cộng, nhân",
            "Xác suất có điều kiện",
            "Xác suất toàn phần và công thức Bayes",
            "Biến ngẫu nhiên, phân phối chuẩn",
          ],
        },
        {
          title: "Biến cố và công thức cộng",
          bullets: [
            "P(A ∪ B) = P(A) + P(B) − P(A ∩ B)",
            "Hai biến cố xung khắc: P(A ∩ B) = 0",
            "Biến cố đối: P(Ā) = 1 − P(A)",
            "A, B độc lập: P(A ∩ B) = P(A)·P(B)",
          ],
        },
        {
          title: "Xác suất có điều kiện",
          bullets: [
            "P(A|B) = P(A ∩ B) / P(B), với P(B) > 0",
            "Công thức nhân: P(A ∩ B) = P(B)·P(A|B)",
            "Ví dụ: 3 bi đỏ, 2 bi xanh, lấy 2 bi không hoàn lại",
            "P(cả hai đỏ) = 3/5 · 2/4 = 3/10",
          ],
        },
        {
          title: "Xác suất toàn phần",
          bullets: [
            "Hệ đầy đủ A₁, …, Aₙ: đôi một xung khắc, hợp lại là Ω",
            "P(B) = Σ P(Aᵢ)·P(B|Aᵢ)",
            "Dùng khi B xảy ra qua nhiều nguyên nhân khác nhau",
            "Vẽ cây xác suất để khỏi nhầm nhánh",
          ],
        },
        {
          title: "Công thức Bayes",
          bullets: [
            "P(Aᵢ|B) = P(Aᵢ)·P(B|Aᵢ) / P(B)",
            "Mẫu số là xác suất toàn phần P(B)",
            "Biết P(B|A) và cần tính ngược P(A|B)",
            "P(Aᵢ) là tiên nghiệm, P(Aᵢ|B) là hậu nghiệm",
          ],
        },
        {
          title: "Ví dụ xét nghiệm",
          bullets: [
            "1% mắc bệnh; dương tính đúng 99%; dương tính giả 5%",
            "P(+) = 0,01·0,99 + 0,99·0,05 = 0,0594",
            "P(bệnh|+) = 0,0099 / 0,0594 = 1/6",
            "Chỉ khoảng 16,7%: tỉ lệ mắc bệnh thấp kéo kết quả xuống",
          ],
        },
        {
          title: "Biến ngẫu nhiên và phân phối chuẩn",
          bullets: [
            "Var(X) = E(X²) − [E(X)]²",
            "X ~ B(n, p): E(X) = np, Var(X) = np(1 − p)",
            "X ~ N(μ, σ²): chuẩn hoá Z = (X − μ) / σ",
            "Tra bảng: P(Z ≤ 1,96) ≈ 0,975",
            "Khoảng tin cậy 95% dùng hệ số 1,96",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Đề thi & lời giải",
      name: "de-cuong-on-thi-cuoi-ky.docx",
      by: "baotram",
      description: "Đề cương ôn thi cuối kỳ cho ba môn Giải tích 1, Đại số tuyến tính, Xác suất thống kê.",
      tags: ["de-cuong", "on-thi", "cuoi-ky"],
      title: "Đề cương ôn thi cuối kỳ: Giải tích 1, Đại số tuyến tính, Xác suất thống kê",
      sections: [
        {
          heading: "1. Kế hoạch ôn tập 4 tuần",
          paragraphs: [
            "Tuần 1 ôn Giải tích 1, tuần 2 ôn Đại số tuyến tính, tuần 3 ôn Xác suất thống kê, tuần 4 làm đề tổng hợp có bấm giờ.",
            "Mỗi cặp bạn giỏi kèm bạn yếu hẹn một buổi mỗi tuần; thầy cố vấn ghé buổi ôn nhóm để giải đáp các câu còn vướng.",
          ],
        },
        {
          heading: "2. Giải tích 1",
          bullets: [
            "Giới hạn và liên tục: dạng vô định, ba giới hạn đáng nhớ, quy tắc L'Hôpital",
            "Đạo hàm và ứng dụng: đạo hàm hàm hợp, đạo hàm logarit, cực trị, khảo sát hàm số",
            "Tích phân bất định: đổi biến, từng phần; tích phân suy rộng ∫₁^∞ dx/x^p hội tụ khi p > 1",
            "Chuỗi số: so sánh, D'Alembert, Cauchy; chuỗi Σ 1/n^p hội tụ khi p > 1",
          ],
        },
        {
          heading: "3. Đại số tuyến tính",
          bullets: [
            "Định thức: quy tắc Sarrus, khai triển theo hàng hoặc cột",
            "Ma trận nghịch đảo: A khả nghịch khi det(A) ≠ 0",
            "Hạng của ma trận và biện luận hệ phương trình theo tham số m",
            "Trị riêng, vector riêng và chéo hoá ma trận",
          ],
        },
        {
          heading: "4. Xác suất thống kê",
          bullets: [
            "Xác suất có điều kiện, công thức nhân, xác suất toàn phần và Bayes",
            "Biến ngẫu nhiên: kỳ vọng E(X), phương sai Var(X) = E(X²) − [E(X)]²",
            "Phân phối nhị thức B(n, p) và phân phối chuẩn N(μ, σ²)",
          ],
        },
        {
          heading: "5. Quy định học nhóm",
          bullets: [
            "Hỏi bài thì ghi rõ đề và mình đã làm đến bước nào",
            "Giải bài từng bước, không chỉ đưa đáp số",
            "Đề thi và lời giải đăng ở kênh Đề thi & lời giải",
            "Buổi ôn nhóm Chủ nhật 9h tại phòng tự học tầng 2 thư viện",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Đề thi & lời giải",
      name: "bang-diem-theo-doi-lam-de.xlsx",
      by: "thu",
      description: "Bảng theo dõi điểm làm đề thử, thời gian làm và những câu hay sai của từng bạn.",
      tags: ["bang-diem", "lam-de", "theo-doi"],
      sheetName: "Làm đề",
      rows: [
        ["Đề", "Người làm", "Thời gian", "Điểm (thang 10)", "Câu hay sai", "Ghi chú"],
        ["Giữa kỳ Giải tích 1 – 2024", "Nhật Minh", "60 phút", "6", "Câu 3: tích phân từng phần", "Quên hằng số +C"],
        ["Giữa kỳ Giải tích 1 – 2024", "Minh Khôi", "60 phút", "8", "Câu 5: chuỗi số", "Làm lại phần D'Alembert"],
        ["Giữa kỳ Giải tích 1 – 2024", "Hiếu Trung", "75 phút", "5", "Câu 1: giới hạn", "Cần học lại 3 giới hạn đáng nhớ"],
        ["Xác suất thống kê – 2024", "Tấn Phát", "60 phút", "9", "Câu 4: phân phối chuẩn", "Tra bảng Z chưa quen"],
        ["Xác suất thống kê – 2024", "Cẩm Tú", "60 phút", "7", "Câu 2: Bayes", "Vẽ cây xác suất trước khi tính"],
        ["Xác suất thống kê – 2024", "Gia Bảo", "70 phút", "6,5", "Câu 1: xác suất có điều kiện", "Nhầm có hoàn lại và không hoàn lại"],
        ["Đại số tuyến tính – 2024", "Mỹ Hạnh", "60 phút", "7,5", "Câu 3: trị riêng", "Thiếu bước kiểm tra vector riêng"],
        ["Đại số tuyến tính – 2024", "Quỳnh Như", "60 phút", "8", "Câu 5: biện luận theo m", "Chia trường hợp chưa đủ"],
      ],
    },
    {
      kind: "poster",
      folder: "Bảng công thức",
      name: "bang-cong-thuc-dao-ham-tich-phan.png",
      by: "yennhi",
      description: "Bảng công thức Giải tích 1 một trang: đạo hàm, nguyên hàm, giới hạn đáng nhớ và chuỗi.",
      tags: ["cong-thuc", "dao-ham", "tich-phan"],
      poster: {
        title: "Bảng công thức Giải tích 1",
        subtitle: "Đạo hàm, nguyên hàm, giới hạn đáng nhớ",
        theme: "amber",
        sections: [
          {
            head: "Đạo hàm cơ bản",
            lines: ["(xⁿ)' = n·xⁿ⁻¹", "(eˣ)' = eˣ ; (aˣ)' = aˣ·ln a", "(ln x)' = 1/x", "(sin x)' = cos x ; (cos x)' = −sin x", "(arctan x)' = 1/(1 + x²)"],
          },
          {
            head: "Quy tắc đạo hàm",
            lines: ["(u·v)' = u'v + uv'", "(u/v)' = (u'v − uv') / v²", "[f(g(x))]' = f'(g(x))·g'(x)", "Dạng u^v: lấy ln hai vế"],
          },
          {
            head: "Nguyên hàm cơ bản",
            lines: ["∫ xⁿ dx = xⁿ⁺¹/(n + 1) + C, n ≠ −1", "∫ dx/x = ln|x| + C", "∫ eˣ dx = eˣ + C", "∫ sin x dx = −cos x + C", "∫ cos x dx = sin x + C"],
          },
          {
            head: "Kỹ thuật tích phân",
            lines: ["Đổi biến: đặt t = g(x)", "Từng phần: ∫ u dv = uv − ∫ v du", "Ví dụ: ∫ x·eˣ dx = (x − 1)eˣ + C", "Đừng quên hằng số +C"],
          },
          {
            head: "Giới hạn đáng nhớ (x → 0)",
            lines: ["sin x / x → 1", "(eˣ − 1) / x → 1", "ln(1 + x) / x → 1", "(1 − cos x) / x² → 1/2", "(1 + x)^(1/x) → e"],
          },
          {
            head: "Tích phân suy rộng và chuỗi",
            lines: ["∫₁^∞ dx/x^p hội tụ ⇔ p > 1", "Σ 1/n^p hội tụ ⇔ p > 1", "Chuỗi điều hoà Σ 1/n phân kỳ", "D'Alembert (chuỗi dương):", "lim aₙ₊₁/aₙ < 1 thì hội tụ"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Bảng công thức",
      name: "so-do-giai-he-phuong-trinh-tuyen-tinh.png",
      by: "trungkien",
      description: "Sơ đồ các bước giải và biện luận hệ phương trình tuyến tính theo hạng của ma trận.",
      tags: ["dai-so", "he-phuong-trinh", "so-do"],
      poster: {
        title: "Giải hệ phương trình tuyến tính",
        subtitle: "Biện luận theo hạng của ma trận",
        theme: "ocean",
        sections: [
          {
            head: "Bước 1: Ma trận mở rộng",
            lines: ["Viết hệ dạng Ax = b", "Lập ma trận mở rộng (A | b)", "Có tham số m: giữ nguyên chữ m"],
          },
          {
            head: "Bước 2: Dạng bậc thang",
            lines: ["Biến đổi sơ cấp theo hàng", "Đổi chỗ hai hàng", "Nhân một hàng với số khác 0", "Cộng bội của hàng này vào hàng kia"],
          },
          {
            head: "Bước 3: So sánh hạng",
            lines: ["Tính r(A) và r(A | b)", "n là số ẩn của hệ", "Hạng = số hàng khác 0 của bậc thang"],
          },
          {
            head: "Kết luận",
            lines: ["r(A) < r(A | b): vô nghiệm", "r(A) = r(A | b) = n: nghiệm duy nhất", "r(A) = r(A | b) < n: vô số nghiệm", "Số tham số tự do = n − r(A)"],
          },
          {
            head: "Hệ vuông n × n",
            lines: ["det(A) ≠ 0: nghiệm duy nhất", "det(A) = 0: xét riêng từng giá trị m", "Cramer: xᵢ = det(Aᵢ) / det(A)"],
          },
          {
            head: "Nhớ kiểm tra",
            lines: ["Thay nghiệm ngược vào hệ", "Chia trường hợp theo m cho đủ", "Hệ thuần nhất luôn có nghiệm 0"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Bảng công thức",
      name: "Cheat sheet xac suat thong ke.md",
      by: "tanphat",
      description: "Cheat sheet xác suất thống kê: công thức cộng, nhân, Bayes và các phân phối thường gặp.",
      tags: ["xac-suat", "cong-thuc", "cheat-sheet"],
      body: L(
        "# Cheat sheet Xác suất thống kê",
        "",
        "## 1. Biến cố",
        "- P(A ∪ B) = P(A) + P(B) − P(A ∩ B)",
        "- P(Ā) = 1 − P(A)",
        "- A, B độc lập ⇔ P(A ∩ B) = P(A)·P(B)",
        "",
        "## 2. Có điều kiện, nhân, toàn phần, Bayes",
        "- P(A|B) = P(A ∩ B) / P(B), với P(B) > 0",
        "- P(A ∩ B) = P(B)·P(A|B)",
        "- Hệ đầy đủ A₁,…,Aₙ: P(B) = Σ P(Aᵢ)·P(B|Aᵢ)",
        "- Bayes: P(Aᵢ|B) = P(Aᵢ)·P(B|Aᵢ) / P(B)",
        "",
        "## 3. Biến ngẫu nhiên",
        "- Kỳ vọng rời rạc: E(X) = Σ xᵢ·pᵢ",
        "- Phương sai: Var(X) = E(X²) − [E(X)]²",
        "- Độ lệch chuẩn: σ = √Var(X)",
        "",
        "## 4. Các phân phối hay gặp",
        "| Phân phối | Công thức | E(X) | Var(X) |",
        "| --- | --- | --- | --- |",
        "| Nhị thức B(n, p) | P(X = k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ | np | np(1 − p) |",
        "| Poisson P(λ) | P(X = k) = e^(−λ)·λᵏ / k! | λ | λ |",
        "| Chuẩn N(μ, σ²) | Z = (X − μ) / σ ~ N(0, 1) | μ | σ² |",
        "",
        "## 5. Bảng tra nhanh Φ(z) của N(0, 1)",
        "- Φ(0) = 0,5 ; Φ(1) ≈ 0,8413 ; Φ(2) ≈ 0,9772",
        "- Φ(1,645) ≈ 0,95 ; Φ(1,96) ≈ 0,975",
        "- Φ(−z) = 1 − Φ(z)",
        "- Quy tắc 68–95–99,7: P(|X − μ| < σ) ≈ 0,6827 ; 2σ ≈ 0,9545 ; 3σ ≈ 0,9973",
      ),
    },
    {
      kind: "text",
      folder: "Code mẫu",
      name: "diem-giua-ky-mau.csv",
      by: "tanphat",
      description: "Bảng điểm mẫu đã ẩn danh của 12 bạn để tập tính trung bình, phương sai và độ lệch chuẩn.",
      tags: ["csv", "du-lieu-mau", "thong-ke"],
      body: C`
ma_an_danh,diem_giai_tich,diem_dstt,diem_xstk
SV01,6.0,5.5,7.0
SV02,7.5,6.0,8.0
SV03,5.0,4.5,6.5
SV04,8.0,7.5,8.5
SV05,6.5,6.0,7.0
SV06,9.0,8.5,9.0
SV07,4.5,5.0,5.5
SV08,7.0,6.5,7.5
SV09,8.5,8.0,8.0
SV10,6.0,7.0,6.5
SV11,7.5,7.0,7.5
SV12,5.5,6.0,6.0
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "thong-ke-mo-ta.js",
      by: "tanphat",
      description: "Tính trung bình, trung vị, phương sai, độ lệch chuẩn và hàm phân phối chuẩn Φ(z) bằng JavaScript.",
      tags: ["javascript", "thong-ke", "phan-phoi-chuan"],
      body: C`
// Thống kê mô tả cơ bản cho cột diem_xstk trong diem-giua-ky-mau.csv.
const diemXstk = [7.0, 8.0, 6.5, 8.5, 7.0, 9.0, 5.5, 7.5, 8.0, 6.5, 7.5, 6.0];

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Phương sai: mẫu (chia n - 1) hoặc tổng thể (chia n)
function variance(a, sample = true) {
  const m = mean(a);
  const ss = a.reduce((s, x) => s + (x - m) ** 2, 0);
  return ss / (a.length - (sample ? 1 : 0));
}
const stdev = (a, sample = true) => Math.sqrt(variance(a, sample));

// Hàm sai số erf (xấp xỉ Abramowitz–Stegun 7.1.26, sai số < 1,5e-7)
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}
// Φ(z) = P(Z <= z) với Z ~ N(0, 1)
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

console.log("n =", diemXstk.length);
console.log("Trung bình =", mean(diemXstk)); // 7.25
console.log("Trung vị  =", median(diemXstk)); // 7.25
console.log("Phương sai mẫu =", variance(diemXstk).toFixed(4)); // 11,75 / 11
console.log("Phương sai tổng thể =", variance(diemXstk, false).toFixed(4)); // 11,75 / 12
console.log("Độ lệch chuẩn mẫu =", stdev(diemXstk).toFixed(4));
console.log("Φ(1,96) =", phi(1.96).toFixed(4)); // khoảng 0,9750

console.assert(mean(diemXstk) === 7.25, "trung bình phải là 7.25");
console.assert(median(diemXstk) === 7.25, "trung vị phải là 7.25");
console.assert(Math.abs(variance(diemXstk) - 11.75 / 11) < 1e-12, "phương sai mẫu sai");
console.assert(Math.abs(phi(1.96) - 0.975) < 1e-3, "Φ(1,96) phải xấp xỉ 0,975");
console.assert(Math.abs(phi(0) - 0.5) < 1e-7, "Φ(0) phải bằng 0,5");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "dinh-thuc-nghich-dao.js",
      by: "trungkien",
      description: "Tính định thức, ma trận nghịch đảo và giải hệ bằng quy tắc Cramer, kiểm tra với ví dụ trên lớp.",
      tags: ["javascript", "ma-tran", "dinh-thuc"],
      body: C`
// Định thức, ma trận nghịch đảo và quy tắc Cramer cho ma trận vuông (mảng 2 chiều).

// Ma trận con: bỏ hàng i và cột j
const minor = (m, i, j) => m.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));

// Định thức: khai triển theo hàng 1 (đệ quy)
function det(m) {
  if (m.length === 1) return m[0][0];
  if (m.length === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return m[0].reduce((sum, a, j) => sum + (j % 2 ? -1 : 1) * a * det(minor(m, 0, j)), 0);
}

// Nghịch đảo: A^-1 = (1 / det) * (ma trận phụ hợp), tồn tại khi det khác 0
function inverse(m) {
  const d = det(m);
  if (d === 0) throw new Error("det(A) = 0 nên A không khả nghịch");
  const n = m.length;
  const inv = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cofactor = ((i + j) % 2 ? -1 : 1) * det(n === 1 ? [[1]] : minor(m, i, j));
      inv[j][i] = cofactor / d; // chú ý: chuyển vị
    }
  }
  return inv;
}

// Quy tắc Cramer: x_i = det(A_i) / det(A), A_i là A thay cột i bằng b
function cramer(a, b) {
  const d = det(a);
  if (d === 0) throw new Error("det(A) = 0: hệ không có nghiệm duy nhất");
  return a.map((_, i) => det(a.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)))) / d);
}

const A = [
  [1, 2, 3],
  [0, 1, 4],
  [5, 6, 0],
];
console.log("det(A) =", det(A)); // 1
console.log("A^-1 =", JSON.stringify(inverse(A).map((r) => r.map((x) => x + 0))));
console.log("Cramer:", cramer([[2, 1], [1, 3]], [3, 5])); // [0.8, 1.4]

console.assert(det(A) === 1, "det(A) phải bằng 1");
console.assert(
  JSON.stringify(inverse(A).map((r) => r.map((x) => x + 0))) === "[[-24,18,5],[20,-15,-4],[-5,4,1]]",
  "ma trận nghịch đảo sai",
);
const [x, y] = cramer([[2, 1], [1, 3]], [3, 5]);
console.assert(Math.abs(x - 0.8) < 1e-12 && Math.abs(y - 1.4) < 1e-12, "nghiệm Cramer sai");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "xap-xi-simpson-newton.js",
      by: "minhkhoi",
      description: "Tích phân xấp xỉ bằng quy tắc hình thang, Simpson và giải phương trình f(x) = 0 bằng phương pháp Newton.",
      tags: ["javascript", "tich-phan", "newton"],
      body: C`
// Hai kỹ thuật tính gần đúng hay gặp trong Giải tích: tích phân số và phương pháp Newton.

// Quy tắc hình thang với n đoạn chia
function trapezoid(f, a, b, n) {
  const h = (b - a) / n;
  let s = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) s += f(a + i * h);
  return s * h;
}

// Quy tắc Simpson hợp: n phải chẵn. S = h/3 * [f0 + 4*(lẻ) + 2*(chẵn) + fn]
function simpson(f, a, b, n) {
  if (n % 2 !== 0) throw new Error("n phải là số chẵn");
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

// Newton: x_{k+1} = x_k - f(x_k) / f'(x_k)
function newton(f, df, x0, tol = 1e-12, maxIter = 50) {
  let x = x0;
  for (let k = 0; k < maxIter; k++) {
    const next = x - f(x) / df(x);
    if (Math.abs(next - x) < tol) return next;
    x = next;
  }
  return x;
}

// ∫ từ 0 đến π của sin x dx = 2
console.log("Hình thang (n=10):", trapezoid(Math.sin, 0, Math.PI, 10).toFixed(6));
console.log("Simpson   (n=10):", simpson(Math.sin, 0, Math.PI, 10).toFixed(6));
// ∫ từ 0 đến 1 của e^x dx = e - 1
console.log("Simpson e^x:", simpson(Math.exp, 0, 1, 20).toFixed(6), "so với", (Math.E - 1).toFixed(6));
// √2 là nghiệm dương của x² - 2 = 0
const canHai = newton((x) => x * x - 2, (x) => 2 * x, 1);
console.log("Newton √2 =", canHai);

console.assert(Math.abs(simpson(Math.sin, 0, Math.PI, 100) - 2) < 1e-6, "Simpson phải rất gần 2");
console.assert(
  Math.abs(trapezoid(Math.sin, 0, Math.PI, 10) - 2) > Math.abs(simpson(Math.sin, 0, Math.PI, 10) - 2),
  "Simpson chính xác hơn hình thang với cùng n",
);
console.assert(Math.abs(simpson(Math.exp, 0, 1, 20) - (Math.E - 1)) < 1e-6, "Simpson e^x sai");
console.assert(Math.abs(canHai - Math.SQRT2) < 1e-12, "Newton phải ra √2");
`,
    },
  ],
};

const appdev: WorkspaceResources = {
  folders: [
    { name: "Slide & báo cáo" },
    { name: "Thiết kế UI" },
    { name: "Code mẫu" },
    { name: "Tài liệu kỹ thuật" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide & báo cáo",
      name: "slide-kick-off-tieu-gon.pdf",
      by: "thuhien",
      description: "Slide kick-off dự án Tiêu Gọn: vấn đề, phạm vi MVP, kiến trúc, quy ước và lộ trình.",
      tags: ["kick-off", "tieu-gon", "mvp"],
      theme: "violet",
      slides: [
        {
          title: "Tiêu Gọn — Quản lý chi tiêu cho sinh viên",
          bullets: [
            "Ứng dụng di động React Native + Expo",
            "Backend Node.js/Express + MongoDB",
            "Nhóm làm việc: thiết kế, mobile, backend, QA",
          ],
        },
        {
          title: "Vấn đề cần giải quyết",
          bullets: [
            "Sinh viên hay quên ghi chép chi tiêu",
            "Ghi mất quá 10 giây là dễ bỏ app",
            "Cuối tháng không biết tiền đã đi đâu",
            "Mục tiêu: thêm khoản chi trong 3 chạm",
          ],
        },
        {
          title: "Phạm vi MVP",
          bullets: [
            "Đăng ký và đăng nhập",
            "Ghi khoản thu, khoản chi và phân loại",
            "Thống kê theo tuần, top danh mục",
            "Nhắc ghi chép mỗi tối",
          ],
        },
        {
          title: "Để vòng sau",
          bullets: [
            "Chia tiền nhóm",
            "Quét hoá đơn bằng camera",
            "Đa tiền tệ (mặc định là VND)",
            "Gắn nhãn Sau MVP trong backlog",
          ],
        },
        {
          title: "Kiến trúc tổng quan",
          bullets: [
            "Mobile: Expo Router, Zustand, TanStack Query",
            "API: Express, prefix /api/v1",
            "Cơ sở dữ liệu: MongoDB",
            "Môi trường local chạy bằng docker-compose",
          ],
        },
        {
          title: "Quy ước làm việc",
          bullets: [
            "Nhánh feature/<tên>, commit theo Conventional Commits",
            "Pull request nhỏ, có mô tả, có test",
            "Ít nhất 1 approve mới được merge",
            "Review live một PR sau buổi họp tối Thứ 6",
          ],
        },
        {
          title: "Lộ trình dự kiến",
          bullets: [
            "Tuần 1: wireframe, khởi tạo repo, thiết kế schema",
            "Tuần 2–3: auth, thêm khoản chi, API transactions",
            "Tuần 4: thống kê, đồng bộ offline, nhắc ghi chép",
            "Tuần 5: kiểm thử và demo nội bộ",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Tài liệu kỹ thuật",
      name: "slide-kien-truc-offline-sync.pdf",
      by: "mentortuan",
      description: "Slide kiến trúc app: kiểu dữ liệu chung, cursor pagination, API idempotent và đồng bộ offline.",
      tags: ["kien-truc", "offline", "api"],
      theme: "slate",
      slides: [
        {
          title: "Kiến trúc Tiêu Gọn",
          bullets: [
            "Mobile ↔ REST API ↔ MongoDB",
            "Mỗi tầng một trách nhiệm rõ ràng",
            "Kiểu dữ liệu dùng chung giữa mobile và backend",
            "Tập trung vào luồng thêm khoản chi",
          ],
        },
        {
          title: "Kiểu dữ liệu Transaction",
          bullets: [
            "Trường chính: id, amount, type, category, note, date",
            "amount là số nguyên VND, luôn dương",
            "type là expense hoặc income, quyết định dấu",
            "currency mặc định VND; deletedAt để xoá mềm",
          ],
        },
        {
          title: "Cursor-based pagination",
          bullets: [
            "Hợp với danh sách cuộn vô hạn trên mobile",
            "Cursor là cặp (date, _id)",
            "Trả nextCursor; hết dữ liệu thì nextCursor = null",
            "Index (userId, date, _id) hỗ trợ truy vấn",
          ],
        },
        {
          title: "API idempotent với clientId",
          bullets: [
            "App sinh clientId (UUID) cho mỗi thao tác tạo",
            "Unique index (userId, clientId)",
            "Gửi lại cùng clientId thì trả về bản ghi cũ",
            "Bắt lỗi duplicate key (11000), không kiểm tra trước",
          ],
        },
        {
          title: "Hàng đợi đồng bộ offline",
          bullets: [
            "Lưu thao tác create/update/delete ở máy",
            "Có mạng thì đẩy lên, thất bại thì thử lại",
            "NetInfo để bắt trạng thái mạng",
            "Xung đột: last-write-wins theo updatedAt cho MVP",
          ],
        },
        {
          title: "Bảo mật xác thực",
          bullets: [
            "Mật khẩu băm bằng bcrypt (cost ≥ 10) hoặc argon2",
            "Access token sống ngắn, khoảng 15 phút",
            "Refresh token xoay vòng, lưu bản hash trong DB",
            "Token trên mobile lưu bằng expo-secure-store",
          ],
        },
        {
          title: "Rủi ro và kiểm thử",
          bullets: [
            "Rủi ro lớn nhất là đồng bộ offline",
            "Làm bản đơn giản trước: hàng đợi + thử lại",
            "Kiểm thử với mạng chập chờn",
            "Hiện trạng thái chưa đồng bộ trên từng khoản",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Tài liệu kỹ thuật",
      name: "tai-lieu-api-v1-tieu-gon.docx",
      by: "quocbao",
      description: "Tài liệu API v1 của Tiêu Gọn: quy ước chung, xác thực, khoản chi, thống kê và mã lỗi.",
      tags: ["api", "tai-lieu", "backend"],
      title: "Tài liệu API v1 — Tiêu Gọn",
      sections: [
        {
          heading: "1. Quy ước chung",
          paragraphs: [
            "Mọi endpoint nằm dưới tiền tố /api/v1. Response luôn có dạng { data, error }: thành công thì error là null, thất bại thì data là null.",
            "Thời gian lưu theo ISO 8601 (UTC). Số tiền là số nguyên VND, luôn dương; dấu do trường type quyết định.",
          ],
        },
        {
          heading: "2. Xác thực",
          bullets: [
            "POST /auth/register: tạo tài khoản bằng email và mật khẩu (tối thiểu 8 ký tự)",
            "POST /auth/login: trả access token ngắn hạn và refresh token",
            "POST /auth/refresh: đổi refresh token lấy cặp token mới (xoay vòng)",
            "Gọi API cần đăng nhập bằng header Authorization: Bearer <access token>",
          ],
        },
        {
          heading: "3. Khoản chi (transactions)",
          bullets: [
            "GET /transactions: danh sách theo cursor, trả nextCursor (null khi hết dữ liệu)",
            "POST /transactions: nhận clientId, amount > 0, type, category, note tối đa 200 ký tự",
            "GET, PATCH, DELETE /transactions/:id: xem, sửa một phần, xoá mềm",
            "Gửi lại cùng clientId thì trả về bản ghi cũ, không tạo thêm",
          ],
        },
        {
          heading: "4. Thống kê",
          paragraphs: [
            "GET /stats/weekly trả tổng chi theo từng ngày trong tuần và danh sách top danh mục. Backend dùng aggregation: $match theo userId và khoảng ngày, $group theo ngày.",
          ],
        },
        {
          heading: "5. Mã lỗi thường gặp",
          bullets: [
            "400: dữ liệu sai định dạng (vd amount âm)",
            "401: chưa đăng nhập hoặc token hết hạn",
            "404: không tìm thấy tài nguyên",
            "429: vượt giới hạn số lần gọi (rate limit) ở /auth/*",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Slide & báo cáo",
      name: "ngan-sach-du-an.xlsx",
      by: "kimngan",
      description: "Bảng chi tiêu chung của dự án Tiêu Gọn kèm số người chia và mức chia đều mỗi người.",
      tags: ["ngan-sach", "chi-tieu", "quy-nhom"],
      sheetName: "Chi tiêu",
      rows: [
        ["Khoản chi", "Người trả", "Số tiền (VND)", "Danh mục", "Số người chia", "Mỗi người (VND)"],
        ["Cà phê buổi họp kick-off", "Kim Ngân", "240.000", "Ăn uống", "6", "40.000"],
        ["Thuê tên miền trang giới thiệu (1 năm)", "Kim Ngân", "350.000", "Khác", "5", "70.000"],
        ["Phí server staging tháng đầu", "Gia Huy", "120.000", "Server", "4", "30.000"],
        ["In poster A3 cho buổi demo (3 tờ)", "Kim Ngân", "180.000", "In ấn", "4", "45.000"],
        ["Pizza buổi demo nội bộ", "Kim Ngân", "450.000", "Ăn uống", "9", "50.000"],
        ["Tổng", "", "1.340.000", "", "", ""],
      ],
    },
    {
      kind: "sheet",
      folder: "Tài liệu kỹ thuật",
      name: "ma-tran-kiem-thu-mvp.xlsx",
      by: "phuongthao",
      description: "Ma trận kiểm thử MVP: mã ca, chức năng, bước thực hiện, kết quả mong đợi và trạng thái.",
      tags: ["kiem-thu", "qa", "mvp"],
      sheetName: "Kiểm thử",
      rows: [
        ["Mã", "Chức năng", "Các bước", "Kết quả mong đợi", "Ưu tiên", "Trạng thái"],
        ["TC-01", "Đăng ký", "Nhập email hợp lệ và mật khẩu từ 8 ký tự", "Tạo tài khoản và chuyển sang Trang chủ", "Cao", "Đạt"],
        ["TC-02", "Đăng ký", "Dùng email đã tồn tại", "Báo lỗi trùng email, không tạo tài khoản mới", "Cao", "Đạt"],
        ["TC-03", "Đăng nhập", "Nhập sai mật khẩu", "Báo chung: email hoặc mật khẩu không đúng", "Cao", "Đạt"],
        ["TC-04", "Thêm khoản chi", "Nhập 50000, chọn Ăn uống, bấm Lưu", "Khoản chi hiện đầu danh sách, tổng hôm nay tăng", "Cao", "Đạt"],
        ["TC-05", "Thêm khoản chi", "Nhập số tiền 1.5", "Từ chối giá trị không hợp lệ, app không crash", "Cao", "Lỗi"],
        ["TC-06", "API transactions", "Gửi amount âm hoặc category rỗng", "API trả 400 kèm danh sách lỗi theo trường", "Cao", "Đang sửa"],
        ["TC-07", "Thống kê tuần", "Có khoản chi ở nhiều ngày khác nhau", "Biểu đồ cột và top danh mục đúng tổng", "Trung bình", "Chưa test"],
        ["TC-08", "Đồng bộ offline", "Tắt mạng, thêm 3 khoản, bật mạng lại", "3 khoản lên server, không bị tạo trùng", "Cao", "Chưa test"],
        ["TC-09", "Dark mode", "Đổi giao diện hệ thống sang tối", "Nền và chữ đúng token, chữ nhỏ vẫn đọc rõ", "Trung bình", "Chưa test"],
      ],
    },
    {
      kind: "poster",
      folder: "Thiết kế UI",
      name: "bang-mau-va-token-tieu-gon.png",
      by: "thuytrang",
      description: "Bảng màu, token và quy tắc spacing của app Tiêu Gọn cho cả giao diện sáng và tối.",
      tags: ["bang-mau", "token", "ui"],
      poster: {
        title: "Bảng màu và token Tiêu Gọn",
        subtitle: "Tông tím nhạt, hỗ trợ sáng và tối",
        theme: "violet",
        sections: [
          {
            head: "Nền (background)",
            lines: ["Sáng: #FFFFFF", "Tối: #121212", "Dùng cho toàn màn hình"],
          },
          {
            head: "Bề mặt (surface)",
            lines: ["Sáng: #F5F3FF", "Tối: #1E1B2E", "Dùng cho thẻ, ô nhập, sheet"],
          },
          {
            head: "Màu chính (primary)",
            lines: ["#7C5CFC — tím nhạt", "Dùng cho nút to, icon, điểm nhấn", "Chữ nhỏ: dùng primaryText đậm hơn"],
          },
          {
            head: "Quy tắc tương phản",
            lines: ["Chữ thường: tối thiểu 4.5:1 (WCAG AA)", "Chữ lớn: tối thiểu 3:1", "Kiểm tra cả light và dark mode"],
          },
          {
            head: "Khoảng cách và hình khối",
            lines: ["Lưới 8px: 8, 16, 24, 32", "Padding thẻ tối thiểu 16", "Icon danh mục nét 2px, bo tròn", "Animation dưới 300ms"],
          },
          {
            head: "Đặt tên token",
            lines: ["Theo vai trò: background, surface, text", "Có primary, primaryText, border", "Không đặt theo màu như pink-500", "Khai báo thành theme object một lần"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Tài liệu kỹ thuật",
      name: "so-do-kien-truc-tieu-gon.png",
      by: "quocbao",
      description: "Sơ đồ kiến trúc tổng quan: app Expo, API Express, MongoDB, đồng bộ offline và hạ tầng.",
      tags: ["kien-truc", "so-do", "backend"],
      poster: {
        title: "Sơ đồ kiến trúc Tiêu Gọn",
        subtitle: "Mobile → API → MongoDB",
        theme: "ocean",
        sections: [
          {
            head: "Mobile (Expo)",
            lines: ["Expo Router: thư mục app/", "Zustand: state cục bộ", "TanStack Query: gọi API và cache", "expo-secure-store: lưu refresh token"],
          },
          {
            head: "API (Express)",
            lines: ["Tiền tố /api/v1", "Middleware: helmet, cors, rate limit", "Validate đầu vào bằng Zod", "Response dạng { data, error }"],
          },
          {
            head: "MongoDB",
            lines: ["users, transactions, categories", "Index (userId, date, _id)", "Unique (userId, clientId)", "Xoá mềm bằng deletedAt"],
          },
          {
            head: "Đồng bộ offline",
            lines: ["Hàng đợi thao tác lưu ở máy", "Mỗi thao tác có clientId, updatedAt", "NetInfo bắt trạng thái mạng", "Last-write-wins cho MVP"],
          },
          {
            head: "Bảo mật",
            lines: ["bcrypt với cost ≥ 10", "Access token sống 15 phút", "Refresh token xoay vòng", "CORS giới hạn origin"],
          },
          {
            head: "Hạ tầng",
            lines: ["docker-compose chạy local", "Staging trên Render (gói free)", "MongoDB Atlas M0", "Biến môi trường không commit"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Tài liệu kỹ thuật",
      name: "Quy ước Git và Conventional Commits.md",
      by: "giahuy",
      description: "Quy ước đặt tên nhánh, viết commit theo Conventional Commits và checklist trước khi mở pull request.",
      tags: ["git", "commit", "quy-uoc"],
      body: L(
        "# Quy ước Git của nhóm Tiêu Gọn",
        "",
        "## 1. Nhánh",
        "- `main`: luôn chạy được, chỉ merge qua pull request",
        "- `feature/<tên-ngắn>`: tính năng mới, vd `feature/add-transaction`",
        "- `fix/<tên-ngắn>`: sửa lỗi, vd `fix/amount-decimal-crash`",
        "",
        "## 2. Commit theo Conventional Commits",
        "Cú pháp: `type(phạm vi): mô tả ngắn` — viết ở thể mệnh lệnh, không chấm cuối câu.",
        "",
        "| type | Dùng khi |",
        "| --- | --- |",
        "| `feat` | thêm tính năng |",
        "| `fix` | sửa lỗi |",
        "| `docs` | chỉ đổi tài liệu |",
        "| `refactor` | đổi cấu trúc code, không đổi hành vi |",
        "| `test` | thêm hoặc sửa test |",
        "| `chore` | việc lặt vặt: cấu hình, thư viện |",
        "",
        "Ví dụ:",
        "```",
        "feat(transactions): thêm màn hình nhập khoản chi",
        "fix(api): chặn amount âm ở POST /transactions",
        "chore: thêm eslint-plugin-react-hooks",
        "```",
        "",
        "## 3. Lệnh hay dùng",
        "```bash",
        "git switch -c feature/add-transaction   # tạo và chuyển sang nhánh mới",
        "git add -p                               # chọn từng phần thay đổi để commit",
        "git commit -m \"feat(transactions): thêm màn hình nhập khoản chi\"",
        "git push -u origin feature/add-transaction",
        "git log --oneline                        # xem lịch sử gọn",
        "```",
        "",
        "## 4. Checklist trước khi mở pull request",
        "- [ ] PR nhỏ (dưới khoảng 400 dòng), có mô tả và ảnh chụp nếu đổi giao diện",
        "- [ ] Lint, typecheck và test đều xanh",
        "- [ ] Không còn `console.log` in dữ liệu nhạy cảm (mật khẩu, token)",
        "- [ ] Có ít nhất 1 người approve trước khi merge",
      ),
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "transaction.ts",
      by: "minhanh",
      description: "Kiểu Transaction dùng chung, hàm kiểm tra dữ liệu đầu vào và hàm định dạng tiền VND.",
      tags: ["typescript", "transaction", "validate"],
      body: C`
// Kiểu dữ liệu Transaction dùng chung cho mobile và backend, kèm hàm kiểm tra và định dạng tiền.
type TransactionType = "expense" | "income";

interface Transaction {
  id: string;
  clientId: string; // UUID do app sinh, dùng để chống tạo trùng khi đồng bộ
  amount: number; // số nguyên VND, luôn dương; dấu do type quyết định
  type: TransactionType;
  category: string;
  note?: string;
  date: string; // ISO 8601, UTC
  currency: "VND";
}

const CATEGORIES = ["an-uong", "di-lai", "hoc-tap", "giai-tri", "khac"];

// Trả về danh sách lỗi (mảng rỗng nghĩa là hợp lệ)
function validateTransaction(input: Partial<Transaction>): string[] {
  const errors: string[] = [];
  if (typeof input.amount !== "number" || !Number.isInteger(input.amount) || input.amount <= 0) {
    errors.push("amount phải là số nguyên dương");
  }
  if (input.type !== "expense" && input.type !== "income") {
    errors.push("type phải là expense hoặc income");
  }
  if (typeof input.category !== "string" || !CATEGORIES.includes(input.category)) {
    errors.push("category không nằm trong danh sách cho phép");
  }
  if (input.note !== undefined && input.note.length > 200) {
    errors.push("note tối đa 200 ký tự");
  }
  return errors;
}

// 1500000 -> "1.500.000 ₫" (tự viết bằng regex, không phụ thuộc môi trường)
function formatVnd(amount: number): string {
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₫";
}

// Số tiền có dấu để cộng dồn: chi là số âm, thu là số dương
function signedAmount(t: Pick<Transaction, "amount" | "type">): number {
  return t.type === "expense" ? -t.amount : t.amount;
}

console.log(formatVnd(1500000)); // 1.500.000 ₫
console.log(validateTransaction({ amount: -5, type: "expense", category: "an-uong" }));
console.log(validateTransaction({ amount: 50000, type: "expense", category: "an-uong" }));

console.assert(formatVnd(1500000) === "1.500.000 ₫", "format sai");
console.assert(formatVnd(999) === "999 ₫", "số nhỏ không có dấu chấm");
console.assert(validateTransaction({ amount: 1.5, type: "expense", category: "khac" }).length === 1, "1.5 phải bị từ chối");
console.assert(validateTransaction({ amount: 50000, type: "income", category: "khac" }).length === 0, "dữ liệu đúng phải hợp lệ");
console.assert(signedAmount({ amount: 50000, type: "expense" }) === -50000, "chi phải là số âm");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "sync-queue.ts",
      by: "hoanglong",
      description: "Hàng đợi đồng bộ offline bản đơn giản: thử lại khi mất mạng và không tạo trùng nhờ clientId.",
      tags: ["typescript", "offline", "sync"],
      body: C`
// Hàng đợi đồng bộ offline (bản đơn giản): lưu thao tác, có mạng thì đẩy lên, lỗi thì thử lại sau.
// clientId là UUID do app sinh cho mỗi thao tác, server dùng nó để chống tạo trùng khi gửi lại.
interface QueuedOp { clientId: string; type: "create" | "update" | "delete"; payload: Record<string, unknown>; attempts: number }
type SendFn = (op: QueuedOp) => Promise<void>;

function createSyncQueue(send: SendFn, maxAttempts = 3) {
  const ops: QueuedOp[] = [];
  return {
    get pending(): number {
      return ops.length;
    },
    enqueue(type: QueuedOp["type"], clientId: string, payload: Record<string, unknown>): void {
      ops.push({ clientId, type, payload, attempts: 0 });
    },
    // Gửi lần lượt theo thứ tự. Gặp lỗi thì dừng để giữ đúng thứ tự, lần sau thử lại.
    async flush(): Promise<void> {
      while (ops.length > 0) {
        const op = ops[0];
        try {
          await send(op);
          ops.shift();
        } catch {
          op.attempts += 1;
          if (op.attempts < maxAttempts) return;
          ops.shift(); // thử quá số lần cho phép: bỏ cuộc (nên báo lỗi cho người dùng)
        }
      }
    },
  };
}

// --- Chạy thử: "server" giả lập, idempotent theo clientId ---
let online = false;
const processed = new Set<string>();
const send: SendFn = async (op) => {
  if (!online) throw new Error("mất mạng");
  processed.add(op.clientId); // gửi lại cùng clientId thì Set không tăng
};

async function main(): Promise<void> {
  const queue = createSyncQueue(send, 5);
  queue.enqueue("create", "c1", { amount: 50000 });
  queue.enqueue("create", "c2", { amount: 25000 });

  await queue.flush(); // đang offline
  console.assert(queue.pending === 2 && processed.size === 0, "offline thì chưa gửi được gì");

  online = true;
  await queue.flush();
  console.assert(queue.pending === 0 && processed.size === 2, "online thì gửi hết");

  queue.enqueue("create", "c2", { amount: 25000 }); // gửi lại cùng clientId
  await queue.flush();
  console.log("Đã xử lý:", [...processed]);
  console.assert(processed.size === 2, "gửi lại cùng clientId không được tạo thêm");
}

main();
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "chay-moi-truong-local.sh",
      by: "giahuy",
      description: "Script bash dựng môi trường local: kiểm tra công cụ, bật MongoDB và API bằng Docker, chạy app Expo.",
      tags: ["bash", "docker", "moi-truong"],
      body: C`
#!/usr/bin/env bash
# Dựng môi trường local cho Tiêu Gọn: MongoDB + API chạy bằng Docker, app chạy bằng Expo.
# Giả định cấu trúc repo: api/ (Express), app/ (Expo) và docker-compose.yml ở thư mục gốc.
set -euo pipefail

# 1) Kiểm tra công cụ cần thiết
for cmd in docker node npm curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Thiếu $cmd, hãy cài đặt trước khi chạy." >&2
    exit 1
  fi
done

# 2) Tạo file .env từ file mẫu nếu chưa có
if [ ! -f api/.env ]; then
  cp api/.env.example api/.env
  echo "Đã tạo api/.env từ .env.example, nhớ đổi JWT_SECRET trước khi dùng thật."
fi

# 3) Bật MongoDB và API
docker compose up -d mongo api

echo "Đang chờ API sẵn sàng (tối đa 60 giây)..."
ready=0
for _ in $(seq 1 30); do
  if curl -fs http://localhost:3000/health >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "API chưa lên, xem log bằng: docker compose logs api" >&2
  exit 1
fi
echo "API đã chạy tại http://localhost:3000"

# 4) Cài thư viện và chạy app
cd app
npm install
npx expo start
`,
    },
    {
      kind: "text",
      folder: "Code mẫu",
      name: "app-expo-mau.json",
      by: "hoanglong",
      description: "Cấu hình Expo mẫu cho app Tiêu Gọn: tên, scheme, plugin và địa chỉ API khi chạy local.",
      tags: ["expo", "cau-hinh", "json"],
      body: C`
{
  "expo": {
    "name": "Tiêu Gọn",
    "slug": "tieu-gon",
    "version": "1.0.0",
    "scheme": "tieugon",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "plugins": ["expo-router", "expo-secure-store"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "vn.example.tieugon"
    },
    "android": {
      "package": "vn.example.tieugon"
    },
    "extra": {
      "apiUrl": "http://localhost:3000/api/v1"
    }
  }
}
`,
    },
  ],
};

const ielts: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Writing & Speaking" },
    { name: "Reading & Listening" },
    { name: "Kế hoạch & từ vựng" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-writing-task-2-cau-truc.pdf",
      by: "mentorha",
      description: "Slide Writing Task 2: cấu trúc 4 đoạn, tiêu chí chấm, linking words và lỗi thường gặp.",
      tags: ["writing", "task-2", "cau-truc"],
      theme: "forest",
      slides: [
        {
          title: "Writing Task 2 — Cấu trúc và tiêu chí",
          bullets: [
            "Thời gian khoảng 40 phút, tối thiểu 250 từ",
            "Task 2 có trọng số gấp đôi Task 1",
            "Viết khoảng 260–290 từ là an toàn",
            "Dành 5 phút lập dàn ý và 5 phút soát lỗi",
          ],
        },
        {
          title: "Bốn tiêu chí chấm điểm",
          bullets: [
            "Task Response: trả lời đúng và đủ câu hỏi của đề",
            "Coherence and Cohesion: mạch lạc, liên kết ý",
            "Lexical Resource: vốn từ và collocation",
            "Grammatical Range and Accuracy: đa dạng và chính xác",
            "Mỗi tiêu chí chiếm 25% điểm Writing",
          ],
        },
        {
          title: "Cấu trúc 4 đoạn",
          bullets: [
            "Introduction: paraphrase đề + thesis statement",
            "Body 1: topic sentence, giải thích, ví dụ",
            "Body 2: ý thứ hai, giải thích, ví dụ",
            "Conclusion: nhắc lại quan điểm, không thêm ý mới",
          ],
        },
        {
          title: "Thesis statement",
          bullets: [
            "Là quan điểm chính, nằm cuối Introduction",
            "Agree/Disagree: nêu rõ đồng ý hay không",
            "Discuss both views: nêu hai quan điểm rồi ý kiến riêng",
            "Vd: I partly agree because uniforms promote equality.",
          ],
        },
        {
          title: "Linking words dùng cho đúng",
          bullets: [
            "Thêm ý: Moreover, In addition",
            "Đối lập: However, In contrast",
            "Kết quả: As a result, Therefore",
            "Kết bài: In conclusion, Overall",
            "Chỉ dùng khi đúng ngữ cảnh, đừng rải đại",
          ],
        },
        {
          title: "Lỗi hay gặp",
          bullets: [
            "Thiếu mạo từ: from a young age",
            "Lặp lại nguyên văn đề thay vì paraphrase",
            "Ý chung chung, thiếu ví dụ cụ thể",
            "Bỏ sót một phần của đề (mất điểm Task Response)",
            "Viết quá dài rồi hết giờ",
          ],
        },
        {
          title: "Quy trình luyện mỗi tuần",
          bullets: [
            "Chọn một đề, gạch chân từng yêu cầu của đề",
            "Lập dàn ý 5 phút, viết trong 40 phút",
            "Nộp ở kênh riêng, tối đa 1 bài mỗi tuần",
            "Sửa lại theo nhận xét rồi nộp bản 2",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-cau-truc-4-ky-nang-ielts.pdf",
      by: "thuhien",
      description: "Slide tổng quan cấu trúc bài thi IELTS 4 kỹ năng và chiến lược luyện trong 12 tuần.",
      tags: ["ielts", "tong-quan", "4-ky-nang"],
      theme: "ocean",
      slides: [
        {
          title: "IELTS 6.5+ trong 12 tuần",
          bullets: [
            "Luyện đủ 4 kỹ năng: Listening, Reading, Writing, Speaking",
            "Đặt mục tiêu theo từng kỹ năng, không chỉ điểm tổng",
            "Luyện đều mỗi ngày, ít mà đều",
            "Thông tin chính thức: https://www.ielts.org",
          ],
        },
        {
          title: "Listening",
          bullets: [
            "4 phần, 40 câu hỏi, chỉ nghe một lần",
            "Phần 1–2: bối cảnh đời sống; phần 3–4: học thuật",
            "Lỗi hay gặp: thiếu -s, sai chính tả, quá số từ cho phép",
            "Section 3 hay đổi ý giữa chừng: chờ ý chốt cuối",
          ],
        },
        {
          title: "Reading",
          bullets: [
            "3 đoạn văn, 40 câu hỏi, 60 phút",
            "Không có thời gian chép đáp án riêng",
            "Chia thời gian khoảng 17 – 20 – 23 phút cho 3 đoạn",
            "Skim để nắm ý chính, scan để tìm thông tin",
            "Kẹt hơn khoảng 1,5 phút thì đánh dấu rồi quay lại",
          ],
        },
        {
          title: "Writing",
          bullets: [
            "2 bài, tổng cộng 60 phút",
            "Task 1: mô tả biểu đồ, tối thiểu 150 từ, khoảng 20 phút",
            "Task 2: bài luận, tối thiểu 250 từ, khoảng 40 phút",
            "Task 2 có trọng số gấp đôi Task 1",
          ],
        },
        {
          title: "Speaking",
          bullets: [
            "3 phần, khoảng 11–14 phút",
            "Part 1: giới thiệu và câu hỏi quen thuộc",
            "Part 2: nói 1–2 phút, có 1 phút chuẩn bị",
            "Part 3: thảo luận mở rộng, trừu tượng hơn",
            "Ghi âm lại để tự nghe và sửa",
          ],
        },
        {
          title: "Chiến lược 12 tuần",
          bullets: [
            "Tuần 1–2: test đầu vào, nền tảng từ vựng và ngữ pháp",
            "Tuần 3–5: luyện từng kỹ năng, 50 từ Academic mỗi tuần",
            "Tuần 6 và 12: mock test đủ 4 kỹ năng",
            "Tuần 7–11: luyện đề có bấm giờ, review lỗi sai",
          ],
        },
        {
          title: "Cách làm việc nhóm",
          bullets: [
            "Luyện nói theo cặp, 2 buổi mỗi tuần",
            "Mỗi ngày một phiên Pomodoro 25 phút",
            "Đăng 1–2 từ Academic mỗi ngày ở kênh Từ vựng",
            "Nộp Writing để cô Hà chấm, tối đa 1 bài mỗi tuần",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Writing & Speaking",
      name: "bai-mau-task-2-early-education.docx",
      by: "mentorha",
      description: "Bài mẫu Task 2 về giáo dục sớm kèm nhận xét theo bốn tiêu chí chấm và từ vựng đáng học.",
      tags: ["writing", "bai-mau", "task-2"],
      title: "Bài mẫu Writing Task 2: Early education",
      sections: [
        {
          heading: "1. Đề bài",
          paragraphs: [
            "Children should start school at a very early age. To what extent do you agree or disagree?",
          ],
        },
        {
          heading: "2. Bài mẫu",
          paragraphs: [
            "It is widely believed that children should begin formal education at an early age. I partly agree with this view, because early schooling builds social skills and good habits, but starting too young can also put unnecessary pressure on children.",
            "On the one hand, early education offers clear benefits. First, in a classroom, young children learn to share, take turns and cooperate with others, which are skills that are difficult to develop at home alone. For example, a child who attends kindergarten from the age of four usually adapts more easily to primary school than a child who has never spent a full day away from the family. Second, regular timetables help children form positive routines, such as listening to teachers and finishing simple tasks. In addition, learning in a group helps children build the confidence to speak up and ask questions.",
            "On the other hand, children develop at different speeds, and a very early start is not suitable for everyone. If lessons are too academic, young learners may feel stressed and lose interest in studying before they have even begun. Play is also an essential way for small children to explore the world, so schools for this age group should focus on games, stories and creative activities rather than exams. As a result, parents should look for gentle programmes that respect each child’s own pace.",
            "In conclusion, I agree that children can benefit from starting school early, as long as the programme is gentle, play-based and led by well-trained teachers. Parents and governments should therefore support early education without turning it into a competition.",
          ],
        },
        {
          heading: "3. Nhận xét theo bốn tiêu chí",
          bullets: [
            "Task Response: nêu rõ quan điểm partly agree và phát triển cả hai phía bằng ví dụ",
            "Coherence and Cohesion: mỗi đoạn có topic sentence; On the one hand / On the other hand dẫn ý rõ",
            "Lexical Resource: formal education, positive routines, play-based thay cho từ đơn giản như good habits",
            "Grammatical Range and Accuracy: kết hợp câu phức, mệnh đề if, cấu trúc as long as",
          ],
        },
        {
          heading: "4. Cụm từ đáng học",
          bullets: [
            "It is widely believed that … (thay cho Many people think that …)",
            "adapt to (primary school) — thích nghi với",
            "form positive routines — hình thành thói quen tốt",
            "as long as … — miễn là, với điều kiện là",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Kế hoạch & từ vựng",
      name: "de-cuong-ke-hoach-12-tuan.docx",
      by: "thu",
      description: "Đề cương kế hoạch luyện IELTS 12 tuần: mục tiêu, giai đoạn, lịch sinh hoạt và quy ước nộp bài.",
      tags: ["ke-hoach", "de-cuong", "12-tuan"],
      title: "Đề cương kế hoạch luyện IELTS 12 tuần",
      sections: [
        {
          heading: "1. Mục tiêu",
          paragraphs: [
            "Cả nhóm hướng tới IELTS 6.5+ sau 12 tuần. Mỗi bạn đặt mục tiêu riêng cho từng kỹ năng và cập nhật điểm vào bảng theo dõi sau mỗi bài test.",
          ],
        },
        {
          heading: "2. Các giai đoạn",
          bullets: [
            "Tuần 1–2: làm bài test đầu vào để biết band hiện tại, ôn nền tảng từ vựng và ngữ pháp",
            "Tuần 3–5: luyện từng kỹ năng, mỗi tuần 50 từ Academic",
            "Tuần 6: mock test đủ 4 kỹ năng lần 1",
            "Tuần 7–11: luyện đề Cambridge có bấm giờ và review lỗi sai",
            "Tuần 12: mock test lần 2 và tổng kết",
          ],
        },
        {
          heading: "3. Lịch sinh hoạt",
          bullets: [
            "Luyện Speaking theo cặp 2 buổi mỗi tuần (chốt giờ bằng poll ở kênh Speaking Practice)",
            "Mỗi ngày một phiên Pomodoro 25 phút ở Phòng tập trung",
            "Thứ Bảy 8h sáng làm full test Listening, 10h chấm cùng nhau",
          ],
        },
        {
          heading: "4. Quy ước nộp bài",
          bullets: [
            "Writing nộp ở kênh riêng cho cô Hà, tối đa 1 bài mỗi tuần",
            "Cô chấm trong vòng 2 ngày; nộp xong kéo thẻ sang cột Chờ feedback",
            "Gạch chân từng yêu cầu của đề trước khi viết",
          ],
        },
        {
          heading: "5. Chi phí chung",
          paragraphs: [
            "Tiền in đề và tài khoản luyện đề online được thủ quỹ ghi vào mục chi tiêu của nhóm và chia đều vào cuối tháng cho những bạn tham gia khoản đó.",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Kế hoạch & từ vựng",
      name: "lich-luyen-speaking-theo-cap.xlsx",
      by: "camtu",
      description: "Lịch luyện Speaking theo cặp trong 4 tuần: giờ luyện, phần luyện, chủ đề và ghi chú.",
      tags: ["speaking", "lich", "luyen-cap"],
      sheetName: "Speaking",
      rows: [
        ["Tuần", "Ngày giờ", "Cặp luyện", "Phần luyện", "Chủ đề", "Ghi chú"],
        ["1", "Thứ 5, 20h", "Bảo Châu – Gia Bảo", "Part 1", "Bản thân, gia đình, quê hương", "Làm quen, nói chậm và rõ"],
        ["1", "Thứ 7, 9h (offline)", "Cẩm Tú – Đức Anh", "Part 2", "A place you visited", "Ghi từ khoá 1 phút trước khi nói"],
        ["2", "Thứ 5, 20h", "Anh Thư – Yến Nhi", "Part 2", "A book you enjoyed", "Theo khung Introduce → Details → Feeling → Conclusion"],
        ["2", "Thứ 7, 9h (offline)", "Mỹ Hạnh – Hiếu Trung", "Part 1", "Học tập và công việc", "Bớt từ đệm ờ, ừm"],
        ["3", "Thứ 5, 20h", "Quỳnh Như – Khánh Linh", "Part 3", "Technology", "Mở rộng câu trả lời bằng lý do và ví dụ"],
        ["3", "Thứ 7, 9h (offline)", "Bảo Châu – Cẩm Tú", "Part 2", "A person who helped you", "Ghi âm để tự nghe lại"],
        ["4", "Thứ 5, 20h", "Gia Bảo – Anh Thư", "Part 3", "Environment", "Dùng cụm câu giờ: Well, let me think"],
        ["4", "Thứ 7, 9h (offline)", "Đức Anh – Thu Hiền", "Part 2", "An object you value", "Nhận xét Fluency và Vocabulary"],
      ],
    },
    {
      kind: "sheet",
      folder: "Kế hoạch & từ vựng",
      name: "theo-doi-band-diem.xlsx",
      by: "thu",
      description: "Bảng theo dõi band hiện tại, mục tiêu và kỹ năng cần ưu tiên của từng thành viên.",
      tags: ["band-diem", "muc-tieu", "theo-doi"],
      sheetName: "Band điểm",
      rows: [
        ["Thành viên", "Band hiện tại", "Mục tiêu", "Kỹ năng yếu nhất", "Việc cần làm tuần này"],
        ["Anh Thư", "6.5", "7.0", "Writing (6.0)", "Nộp bài Task 2 chủ đề Technology"],
        ["Bảo Châu", "5.0", "6.5", "Listening", "Luyện cặp teen/ty, nghe chép chính tả"],
        ["Quỳnh Như", "5.5", "6.5", "Writing", "Sửa bài Early education theo nhận xét của cô"],
        ["Yến Nhi", "6.5", "7.0", "Listening", "Làm full test Listening số 1"],
        ["Mỹ Hạnh", "5.5", "6.5", "Speaking", "Part 2: nói đủ 1–2 phút"],
        ["Hiếu Trung", "5.5", "6.5", "Speaking", "Bớt từ đệm, tập câu giờ tự nhiên"],
      ],
    },
    {
      kind: "poster",
      folder: "Writing & Speaking",
      name: "cheat-sheet-writing-task-2.png",
      by: "mentorha",
      description: "Cheat sheet Writing Task 2: cấu trúc, tiêu chí chấm, linking words, lỗi hay gặp và paraphrase.",
      tags: ["writing", "cheat-sheet", "task-2"],
      poster: {
        title: "Cheat sheet Writing Task 2",
        subtitle: "Dành cho bài 250 từ trong 40 phút",
        theme: "forest",
        sections: [
          {
            head: "Cấu trúc 4 đoạn",
            lines: ["Intro: paraphrase đề + thesis", "Body 1: ý chính + giải thích + ví dụ", "Body 2: ý thứ hai + ví dụ", "Conclusion: nhắc lại quan điểm"],
          },
          {
            head: "Bốn tiêu chí (25% mỗi tiêu chí)",
            lines: ["Task Response", "Coherence and Cohesion", "Lexical Resource", "Grammatical Range and Accuracy"],
          },
          {
            head: "Linking words",
            lines: ["Thêm ý: Moreover, In addition", "Đối lập: However, In contrast", "Kết quả: As a result, Therefore", "Kết bài: In conclusion, Overall"],
          },
          {
            head: "Lỗi hay gặp",
            lines: ["from young age → from a young age", "Lặp lại nguyên văn đề", "Thiếu ví dụ cụ thể", "Viết dưới 250 từ"],
          },
          {
            head: "Paraphrase mẫu",
            lines: ["many people think → it is widely believed", "children → young learners", "good habits → positive routines", "go to school → receive formal education"],
          },
          {
            head: "Quản lý thời gian",
            lines: ["5 phút lập dàn ý", "30 phút viết bài", "5 phút soát lỗi", "Nhắm 260–290 từ"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Reading & Listening",
      name: "reading-tf-ng-meo-lam-bai.png",
      by: "yennhi",
      description: "Poster mẹo Reading: phân biệt True/False/Not Given, skimming, scanning và chia thời gian.",
      tags: ["reading", "true-false", "meo-lam-bai"],
      poster: {
        title: "Reading: T/F/NG và thời gian",
        subtitle: "Mẹo làm bài 60 phút",
        theme: "ocean",
        sections: [
          {
            head: "TRUE",
            lines: ["Đoạn văn nói đúng như câu đề", "Có thể diễn đạt bằng từ đồng nghĩa"],
          },
          {
            head: "FALSE",
            lines: ["Đoạn văn nói NGƯỢC lại câu đề", "Chủ đề được nhắc tới nhưng trái ý"],
          },
          {
            head: "NOT GIVEN",
            lines: ["Đoạn văn không đề cập thông tin này", "Không đủ thông tin để kết luận", "Đừng dùng kiến thức bên ngoài"],
          },
          {
            head: "Skimming và scanning",
            lines: ["Skimming: đọc lướt lấy ý chính", "Scanning: lướt tìm tên, số, ngày", "Matching Headings: skim câu đầu, cuối", "Điền từ: scan keyword"],
          },
          {
            head: "Phân bổ 60 phút",
            lines: ["Passage 1: khoảng 17 phút", "Passage 2: khoảng 20 phút", "Passage 3: khoảng 23 phút", "Ghi đáp án thẳng vào answer sheet"],
          },
          {
            head: "Mẹo hay",
            lines: ["Kẹt hơn 1,5 phút: đánh dấu, bỏ qua", "Tìm keyword rồi đọc kỹ 1–2 câu quanh nó", "Cẩn thận bẫy số và tên riêng", "Ghi lại 10 lỗi sai hay mắc"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Kế hoạch & từ vựng",
      name: "Cheat sheet collocations hay gap.md",
      by: "khanhlinh",
      description: "Bảng collocations thường dùng trong Writing và Speaking kèm nghĩa và câu ví dụ.",
      tags: ["collocations", "tu-vung", "cheat-sheet"],
      body: L(
        "# Cheat sheet collocations hay gặp",
        "",
        "Học theo cụm thay vì từ lẻ: cụm từ giúp bài viết tự nhiên và dễ nhớ lâu hơn.",
        "",
        "| Collocation | Nghĩa | Ví dụ |",
        "| --- | --- | --- |",
        "| make a decision | đưa ra quyết định | Governments must make a decision soon. |",
        "| play a vital role in | đóng vai trò quan trọng trong | Education plays a vital role in reducing poverty. |",
        "| have an impact on | có tác động đến | Social media has an impact on teenagers. |",
        "| pose a threat to | gây ra mối đe doạ cho | Plastic waste poses a threat to marine life. |",
        "| raise awareness of | nâng cao nhận thức về | Campaigns raise awareness of climate change. |",
        "| take measures to | thực hiện biện pháp để | Cities should take measures to reduce traffic. |",
        "| meet the demand for | đáp ứng nhu cầu về | More housing is needed to meet the demand for homes. |",
        "| tackle a problem | giải quyết một vấn đề | Higher taxes can help tackle air pollution. |",
        "",
        "## Cụm động từ thường dùng",
        "- do research / carry out research: nghiên cứu",
        "- pay attention to: chú ý đến",
        "- take into account: cân nhắc, tính đến",
        "- bear in mind: ghi nhớ",
        "- come to a conclusion: đi đến kết luận",
        "",
        "## Cụm diễn đạt quan điểm",
        "- I strongly agree that … : tôi hoàn toàn đồng ý rằng …",
        "- It is widely believed that … : nhiều người tin rằng …",
        "- From my point of view, … : theo quan điểm của tôi, …",
        "",
        "## Mẹo",
        "- Ghi collocation vào sổ theo chủ đề (Environment, Education, Technology …)",
        "- Mỗi bài Writing cố gắng dùng đúng 3–4 cụm mới, đừng nhồi nhét",
      ),
    },
    {
      kind: "text",
      folder: "Kế hoạch & từ vựng",
      name: "tu-vung-academic-tuan-4.csv",
      by: "khanhlinh",
      description: "50 từ Academic của tuần 4 (bản rút gọn 12 từ) kèm từ loại, nghĩa và câu ví dụ.",
      tags: ["tu-vung", "academic", "csv"],
      body: C`
tu,loai_tu,nghia,vi_du
mitigate,verb,làm giảm nhẹ,"Governments should invest in public transport to mitigate air pollution."
detrimental,adjective,có hại,"Excessive screen time can be detrimental to children's health."
alleviate,verb,làm dịu bớt,"Subsidies can alleviate the burden on low-income families."
phenomenon,noun,hiện tượng (số nhiều: phenomena),"Urbanisation is a global phenomenon."
consume,verb,tiêu thụ,"Teenagers consume a lot of sugary drinks."
consequence,noun,hậu quả,"Air pollution has serious consequences for public health."
sustainable,adjective,bền vững,"Sustainable energy sources include wind and solar power."
implement,verb,thực hiện hoặc triển khai,"The city plans to implement a new recycling scheme."
significant,adjective,đáng kể,"There was a significant rise in online shopping."
contribute,verb,đóng góp hoặc góp phần,"Cars contribute to air pollution in big cities."
enhance,verb,nâng cao,"Technology can enhance the quality of education."
vulnerable,adjective,dễ bị tổn thương,"Elderly people are especially vulnerable to heat waves."
`,
    },
    {
      kind: "text",
      folder: "Writing & Speaking",
      name: "Khung tra loi Speaking Part 1-2-3.md",
      by: "camtu",
      description: "Khung trả lời Speaking cho Part 1, 2, 3, các cụm câu giờ tự nhiên và lỗi nên tránh.",
      tags: ["speaking", "khung-tra-loi", "meo"],
      body: L(
        "# Khung trả lời Speaking Part 1 – 2 – 3",
        "",
        "Tổng thời gian khoảng 11–14 phút. Nói tự nhiên, không học thuộc lòng.",
        "",
        "## Part 1 (4–5 phút): câu hỏi quen thuộc",
        "- Trả lời 2–3 câu: **Đáp án trực tiếp → lý do → ví dụ ngắn**",
        "- Ví dụ: *Do you like cooking?* → Yes, I do. It helps me relax after class. Last weekend I made pho for my roommates.",
        "",
        "## Part 2 (nói 1–2 phút, có 1 phút chuẩn bị)",
        "Dùng khung **Introduce → Details → Feeling/Reason → Conclusion**:",
        "1. Introduce: I'd like to talk about …",
        "2. Details: ai, khi nào, ở đâu, đã làm gì",
        "3. Feeling/Reason: vì sao đáng nhớ, bạn cảm thấy thế nào",
        "4. Conclusion: kết bằng một câu gọn",
        "",
        "Đề kể trải nghiệm có thể dùng **PPF**: Past – Present – Future để kéo dài ý theo trục thời gian.",
        "",
        "## Part 3 (4–5 phút): thảo luận mở rộng",
        "- **Answer → Reason → Example → (Contrast)**",
        "- Dùng từ nối: *On the one hand … on the other hand …*, *For instance …*, *That said …*",
        "",
        "## Cụm câu giờ tự nhiên",
        "- Well, let me think …",
        "- That's an interesting question.",
        "- It depends on …",
        "",
        "## Lỗi nên tránh",
        "- ✗ I am very like it → ✓ I really like it / I like it very much",
        "- Ngắt quãng bằng ờ, ừm liên tục: thà im lặng 1–2 giây còn hơn",
        "- Trả lời một từ rồi dừng: luôn thêm lý do hoặc ví dụ",
        "",
        "## Tự luyện",
        "- Ghi âm lại phần trả lời, nghe lại và sửa Fluency, Vocabulary",
        "- Luyện theo cặp 2 buổi mỗi tuần, đổi vai người nói và người nhận xét",
      ),
    },
  ],
};

const dsa: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Đề thi các năm" },
    { name: "Code mẫu" },
    { name: "Cheat sheet" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-do-phuc-tap-va-sap-xep.pdf",
      by: "haidang",
      description: "Slide độ phức tạp thuật toán, tìm kiếm nhị phân và các thuật toán sắp xếp kinh điển.",
      tags: ["big-o", "sap-xep", "tim-kiem"],
      theme: "sunset",
      slides: [
        {
          title: "Độ phức tạp thuật toán",
          bullets: [
            "Big-O mô tả tốc độ tăng chi phí theo kích thước n",
            "Thường xét trường hợp xấu nhất",
            "Bỏ hằng số và các số hạng bậc thấp",
            "O(1) < O(log n) < O(n) < O(n log n) < O(n²)",
          ],
        },
        {
          title: "Cách phân tích nhanh",
          bullets: [
            "Một vòng lặp đơn: O(n)",
            "Hai vòng lặp lồng nhau: O(n²)",
            "Mỗi bước chia đôi dữ liệu: O(log n)",
            "Hai đoạn nối tiếp: lấy phần lớn hơn",
            "Khi làm bài thi, ghi rõ trường hợp và giải thích 1 dòng",
          ],
        },
        {
          title: "Mảng và danh sách liên kết",
          bullets: [
            "Truy cập phần tử thứ i: mảng O(1), DSLK O(n)",
            "Chèn hoặc xoá ở đầu: mảng O(n), DSLK O(1)",
            "Tìm kiếm khi chưa sắp xếp: cả hai O(n)",
            "Append vào mảng động: O(1) khấu hao",
          ],
        },
        {
          title: "Tìm kiếm nhị phân",
          bullets: [
            "Cần mảng đã sắp xếp",
            "Mỗi bước loại một nửa đoạn tìm kiếm: O(log n)",
            "mid = left + floor((right − left) / 2)",
            "Điều kiện lặp left ≤ right",
            "Kiểm tra biên: mảng rỗng, một phần tử",
          ],
        },
        {
          title: "Sắp xếp O(n²)",
          bullets: [
            "Bubble, selection, insertion: xấu nhất O(n²)",
            "Insertion sort tốt nhất O(n) khi mảng gần như đã sắp",
            "Selection sort không ổn định",
            "Chỉ nên dùng khi n nhỏ",
          ],
        },
        {
          title: "Merge sort, quick sort, heap sort",
          bullets: [
            "Merge: chia đôi rồi trộn, O(n log n), cần O(n) bộ nhớ phụ",
            "Quick: chọn pivot rồi partition, trung bình O(n log n)",
            "Quick xấu nhất O(n²) và không ổn định",
            "Heap: O(n log n), tại chỗ, không ổn định",
          ],
        },
        {
          title: "Chạy tay quicksort (Lomuto)",
          bullets: [
            "Pivot là phần tử cuối; i bắt đầu từ −1",
            "Duyệt j: nếu a[j] ≤ pivot thì i++ rồi swap(a[i], a[j])",
            "Cuối cùng swap pivot vào vị trí i + 1",
            "[8, 3, 7, 1, 5] → [3, 1, 5, 8, 7], pivot ở vị trí 2",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-do-thi-bfs-dfs-dijkstra.pdf",
      by: "minhkhoi",
      description: "Slide đồ thị: cách biểu diễn, BFS, DFS, duyệt cây, Dijkstra và cách chọn thuật toán.",
      tags: ["do-thi", "bfs", "dijkstra"],
      theme: "ocean",
      slides: [
        {
          title: "Đồ thị và cách biểu diễn",
          bullets: [
            "Danh sách kề: tiết kiệm bộ nhớ, O(V + E)",
            "Ma trận kề: kiểm tra cạnh O(1), tốn O(V²) bộ nhớ",
            "Đồ thị thưa nên dùng danh sách kề",
            "Phân biệt có hướng, vô hướng, có trọng số",
          ],
        },
        {
          title: "BFS — duyệt theo tầng",
          bullets: [
            "Dùng hàng đợi (queue)",
            "Đồ thị không trọng số: cho đường đi ngắn nhất theo số cạnh",
            "Độ phức tạp O(V + E)",
            "dist[v] = −1 có thể dùng làm mảng đã thăm",
          ],
        },
        {
          title: "DFS — duyệt theo chiều sâu",
          bullets: [
            "Dùng đệ quy hoặc ngăn xếp (stack)",
            "Phát hiện chu trình, tìm thành phần liên thông",
            "Sắp xếp topo cho đồ thị có hướng không chu trình",
            "O(V + E); đồ thị rất sâu nên dùng DFS lặp",
          ],
        },
        {
          title: "Duyệt cây nhị phân",
          bullets: [
            "Trước: gốc – trái – phải",
            "Giữa: trái – gốc – phải (BST cho dãy tăng dần)",
            "Sau: trái – phải – gốc",
            "Theo tầng: dùng BFS với hàng đợi",
          ],
        },
        {
          title: "Dijkstra",
          bullets: [
            "Đường đi ngắn nhất từ một nguồn, trọng số ≥ 0",
            "Mỗi bước chốt đỉnh chưa chốt có khoảng cách nhỏ nhất",
            "Dùng min-heap: O((V + E) log V)",
            "Dùng mảng thường: O(V²), hợp với đồ thị dày",
          ],
        },
        {
          title: "Chạy tay Dijkstra",
          bullets: [
            "Vẽ bảng khoảng cách và cập nhật từng bước",
            "Cạnh u→v: nếu d[u] + w < d[v] thì d[v] = d[u] + w",
            "Đánh dấu đỉnh đã chốt, không cập nhật lại",
            "Ghi đỉnh cha để dựng lại đường đi",
          ],
        },
        {
          title: "Chọn thuật toán nào?",
          bullets: [
            "Không trọng số: BFS",
            "Trọng số không âm: Dijkstra",
            "Có cạnh âm: Bellman-Ford, O(V·E)",
            "Mọi cặp đỉnh: Floyd–Warshall, O(V³)",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Đề thi các năm",
      name: "de-cuong-on-thi-ctdl-gt.docx",
      by: "haidang",
      description: "Đề cương ôn thi cuối kỳ CTDL&GT: cấu trúc đề, chủ đề trọng tâm, kế hoạch 3 tuần và quy định nhóm.",
      tags: ["de-cuong", "on-thi", "ctdl-gt"],
      title: "Đề cương ôn thi Cấu trúc dữ liệu và Giải thuật",
      sections: [
        {
          heading: "1. Cấu trúc đề thi các năm",
          paragraphs: [
            "Đề cuối kỳ khá giống nhau giữa các năm: khoảng 3 câu lý thuyết và độ phức tạp, 2 câu chạy tay (sắp xếp, Dijkstra hoặc BFS) và 1 câu cài đặt.",
            "Theo thông báo của thầy, được mang 1 tờ A4 viết tay vào phòng thi, không được photo.",
          ],
        },
        {
          heading: "2. Chủ đề trọng tâm",
          bullets: [
            "Big-O, tìm kiếm nhị phân và so sánh các thuật toán sắp xếp",
            "Mảng, danh sách liên kết, stack, queue (kể cả cài queue bằng 2 stack)",
            "Cây nhị phân, BST, heap và hash table",
            "BFS, DFS, Dijkstra và các trường hợp dùng từng thuật toán",
            "Quy hoạch động: cái túi, LIS, đổi tiền",
          ],
        },
        {
          heading: "3. Kế hoạch 3 tuần",
          bullets: [
            "Tuần 1: Big-O, mảng, danh sách liên kết, stack và queue",
            "Tuần 2: cây, heap, sắp xếp, hash và BFS/DFS cơ bản",
            "Tuần 3: đồ thị nâng cao, quy hoạch động và 2 buổi mock test",
          ],
        },
        {
          heading: "4. Quy định của nhóm",
          bullets: [
            "Hỏi bài thì ghi rõ đề và đoạn code đã thử",
            "Giải xong LeetCode thì báo ở kênh LeetCode hằng ngày",
            "Mock test cuối tuần làm đúng giờ, không xem đáp án trước",
            "Mở Phòng giải thuật tối thứ 5 để giải đáp trực tiếp",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Đề thi các năm",
      name: "theo-doi-leetcode-hang-ngay.xlsx",
      by: "khanhlinh",
      description: "Bảng check-in LeetCode hằng ngày: bài đã giải, kỹ thuật dùng và độ phức tạp.",
      tags: ["leetcode", "check-in", "theo-doi"],
      sheetName: "LeetCode",
      rows: [
        ["Ngày", "Thành viên", "Bài", "Độ khó", "Kỹ thuật", "Thời gian / Bộ nhớ"],
        ["Ngày 1", "Tuấn Kiệt", "Two Sum", "Easy", "Hash map", "O(n) / O(n)"],
        ["Ngày 2", "Bảo Châu", "Valid Parentheses", "Easy", "Stack", "O(n) / O(n)"],
        ["Ngày 3", "Hoàng Long", "Climbing Stairs", "Easy", "Quy hoạch động", "O(n) / O(1)"],
        ["Ngày 4", "Thu", "Merge Two Sorted Lists", "Easy", "Dummy node", "O(n + m) / O(1)"],
        ["Ngày 5", "Tuấn Kiệt", "Maximum Subarray", "Medium", "Kadane", "O(n) / O(1)"],
        ["Ngày 6", "Nhật Minh", "Binary Search", "Easy", "Chia đôi", "O(log n) / O(1)"],
        ["Ngày 7", "Đức Anh", "Reverse Linked List", "Easy", "Hai con trỏ", "O(n) / O(1)"],
        ["Ngày 8", "Gia Huy", "Best Time to Buy and Sell Stock", "Easy", "Duyệt một lần", "O(n) / O(1)"],
      ],
    },
    {
      kind: "poster",
      folder: "Cheat sheet",
      name: "cheat-sheet-do-phuc-tap.png",
      by: "tuankiet",
      description: "Cheat sheet độ phức tạp của cấu trúc dữ liệu, sắp xếp, tìm kiếm và đồ thị.",
      tags: ["big-o", "cheat-sheet", "do-phuc-tap"],
      poster: {
        title: "Cheat sheet độ phức tạp",
        subtitle: "Xem nhanh trước giờ thi",
        theme: "sunset",
        sections: [
          {
            head: "Thứ tự tăng dần",
            lines: ["O(1) < O(log n) < O(n)", "< O(n log n) < O(n²)", "< O(2ⁿ) < O(n!)"],
          },
          {
            head: "Cấu trúc dữ liệu",
            lines: ["Mảng: truy cập O(1), tìm O(n)", "DSLK: chèn đầu O(1), truy cập O(n)", "Stack, queue: push, pop O(1)", "Hash table: trung bình O(1)"],
          },
          {
            head: "Sắp xếp",
            lines: ["Insertion: tốt nhất O(n), xấu O(n²)", "Merge: O(n log n), bộ nhớ O(n)", "Quick: TB O(n log n), xấu O(n²)", "Heap: O(n log n), tại chỗ"],
          },
          {
            head: "Tìm kiếm",
            lines: ["Tuyến tính: O(n)", "Nhị phân (đã sắp xếp): O(log n)", "BST cân bằng: O(log n)", "BST suy biến: O(n)"],
          },
          {
            head: "Đồ thị",
            lines: ["BFS, DFS: O(V + E)", "Dijkstra + heap: O((V + E) log V)", "Dijkstra + mảng: O(V²)", "Bellman-Ford: O(V·E)"],
          },
          {
            head: "Mẹo ghi đề thi",
            lines: ["Luôn ghi rõ trường hợp xấu nhất", "Giải thích 1 dòng: vòng lặp lồng nhau", "Hoặc: mỗi bước chia đôi dữ liệu", "Nêu cả độ phức tạp bộ nhớ"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Cheat sheet",
      name: "so-do-chon-thuat-toan-do-thi.png",
      by: "minhkhoi",
      description: "Sơ đồ chọn thuật toán đồ thị: BFS, DFS, Dijkstra, Bellman-Ford và Floyd–Warshall.",
      tags: ["do-thi", "so-do", "dijkstra"],
      poster: {
        title: "Chọn thuật toán đồ thị",
        subtitle: "Đường đi ngắn nhất và duyệt đồ thị",
        theme: "ocean",
        sections: [
          {
            head: "BFS",
            lines: ["Đồ thị không trọng số", "Đường đi ngắn nhất theo số cạnh", "Dùng queue, O(V + E)"],
          },
          {
            head: "DFS",
            lines: ["Phát hiện chu trình", "Sắp xếp topo", "Tìm thành phần liên thông", "Dùng stack hoặc đệ quy, O(V + E)"],
          },
          {
            head: "Dijkstra",
            lines: ["Trọng số cạnh ≥ 0", "Min-heap: O((V + E) log V)", "Mảng: O(V²), hợp đồ thị dày"],
          },
          {
            head: "Bellman-Ford",
            lines: ["Cho phép cạnh âm", "Phát hiện được chu trình âm", "Độ phức tạp O(V·E)"],
          },
          {
            head: "Floyd–Warshall",
            lines: ["Đường đi ngắn nhất mọi cặp đỉnh", "Độ phức tạp O(V³)", "Hợp đồ thị nhỏ, dùng ma trận kề"],
          },
          {
            head: "Cách chọn nhanh",
            lines: ["Không trọng số → BFS", "Trọng số ≥ 0 → Dijkstra", "Có cạnh âm → Bellman-Ford", "Mọi cặp đỉnh → Floyd–Warshall"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Cheat sheet",
      name: "Cheat sheet quy hoach dong.md",
      by: "minhkhoi",
      description: "Khung 4 bước làm quy hoạch động và công thức truy hồi của các bài kinh điển.",
      tags: ["quy-hoach-dong", "cheat-sheet", "cong-thuc"],
      body: L(
        "# Cheat sheet quy hoạch động (DP)",
        "",
        "## Khi nào dùng DP?",
        "Bài có đủ hai tính chất: **bài toán con gối nhau** và **cấu trúc con tối ưu**.",
        "Ví dụ: Fibonacci đệ quy thuần là O(2ⁿ) vì tính lặp, thêm bộ nhớ (memo) còn O(n).",
        "",
        "## Khung 4 bước",
        "1. Định nghĩa trạng thái: `dp[i]` nghĩa là gì? (ghi rõ ra giấy)",
        "2. Công thức truy hồi: `dp[i]` tính từ các trạng thái nhỏ hơn thế nào?",
        "3. Base case: khởi tạo `dp[0]`, `dp[1]`…",
        "4. Thứ tự tính và vị trí chứa đáp án",
        "",
        "## Top-down và bottom-up",
        "- Top-down: đệ quy + memo, viết theo công thức, chỉ tính trạng thái cần dùng",
        "- Bottom-up: vòng lặp điền bảng, không tốn chi phí gọi đệ quy, dễ tối ưu bộ nhớ",
        "",
        "## Các bài kinh điển",
        "| Bài | dp | Truy hồi | Độ phức tạp |",
        "| --- | --- | --- | --- |",
        "| Leo cầu thang | f(n) = số cách lên bậc n | f(n) = f(n−1) + f(n−2) | O(n) |",
        "| Đổi tiền (ít đồng nhất) | dp[x] = số đồng ít nhất tạo x | dp[x] = min(dp[x−c] + 1) | O(n·số loại tiền) |",
        "| Cái túi 0/1 | dp[i][w] = giá trị lớn nhất với i món đầu, sức chứa w | dp[i][w] = max(dp[i−1][w], dp[i−1][w−wt[i]] + val[i]) | O(n·W) |",
        "| LIS | dp[i] = độ dài dãy tăng dài nhất kết thúc tại i | dp[i] = 1 + max(dp[j]) với j < i, a[j] < a[i] | O(n²) |",
        "",
        "## Lưu ý hay sai",
        "- Cái túi 0/1 tối ưu về mảng 1 chiều: duyệt `w` **ngược** từ W xuống wt[i], nếu duyệt xuôi thì món bị dùng nhiều lần",
        "- LIS tăng **ngặt**: mảng toàn phần tử bằng nhau cho đáp án 1",
        "- Đổi tiền: nên khởi tạo dp bằng vô cùng, dp[0] = 0, và trả −1 nếu không tạo được",
        "- Greedy không phải lúc nào cũng đúng: coins {1, 3, 4}, amount 6 → tham lam chọn 4+1+1 (3 đồng), tối ưu là 3+3 (2 đồng)",
        "- Viết bảng dp bằng tay cho input nhỏ trước khi code",
      ),
    },
    {
      kind: "text",
      folder: "Đề thi các năm",
      name: "De luyen thu CTDL-GT.md",
      by: "khanhlinh",
      description: "Đề luyện thử tự soạn 60 phút theo cấu trúc đề các năm, kèm gợi ý đáp án để đối chiếu.",
      tags: ["de-luyen", "ctdl-gt", "on-thi"],
      body: L(
        "# Đề luyện thử CTDL&GT (tự soạn, 60 phút)",
        "",
        "Làm đúng giờ, không xem phần gợi ý ở cuối trước khi nộp bài.",
        "",
        "## Câu 1 (lý thuyết)",
        "Vì sao tìm kiếm nhị phân cần mảng đã sắp xếp? Nêu độ phức tạp thời gian trong trường hợp xấu nhất.",
        "",
        "## Câu 2 (chạy tay quicksort)",
        "Cho mảng `[6, 2, 8, 4, 5]`. Chạy partition kiểu Lomuto với pivot là phần tử cuối. Ghi mảng sau partition và vị trí của pivot.",
        "",
        "## Câu 3 (chạy tay Dijkstra)",
        "Đồ thị vô hướng có các cạnh (trọng số): A–B 4, A–C 2, B–C 1, B–D 5, C–D 8, C–E 10, D–E 2. Tìm khoảng cách ngắn nhất từ A tới mọi đỉnh và đường đi tới E.",
        "",
        "## Câu 4 (cài đặt)",
        "Cài hàng đợi (queue) chỉ bằng hai ngăn xếp (stack). Mô tả enqueue, dequeue và độ phức tạp khấu hao.",
        "",
        "## Câu 5 (quy hoạch động)",
        "Đổi tiền với các mệnh giá {1, 3, 4}, số tiền 6. Tìm số đồng ít nhất. Lập bảng dp từ 0 đến 6.",
        "",
        "## Câu 6 (so sánh)",
        "So sánh độ phức tạp tìm kiếm trên BST cân bằng và BST suy biến thành danh sách.",
        "",
        "---",
        "",
        "## Gợi ý đáp án",
        "1. Mỗi bước so sánh với phần tử giữa để loại một nửa đoạn tìm kiếm, điều này chỉ đúng khi dãy có thứ tự. Xấu nhất O(log n).",
        "2. i = −1. j = 0: 6 > 5 bỏ qua. j = 1: 2 ≤ 5 nên i = 0, đổi chỗ a[0] và a[1] → [2, 6, 8, 4, 5]. j = 2: 8 > 5. j = 3: 4 ≤ 5 nên i = 1, đổi chỗ a[1] và a[3] → [2, 4, 8, 6, 5]. Cuối cùng đổi chỗ a[2] với pivot → [2, 4, 5, 6, 8], pivot ở vị trí 2.",
        "3. Thứ tự chốt: A (0), C (2), B (3, qua C), D (8, qua B), E (10, qua D). Đường đi tới E: A → C → B → D → E, tổng 10.",
        "4. enqueue: push vào stack1 (O(1)). dequeue: nếu stack2 rỗng thì đổ toàn bộ stack1 sang stack2, rồi pop stack2. Mỗi phần tử được di chuyển tối đa 2 lần nên dequeue O(1) khấu hao.",
        "5. dp[0..6] = 0, 1, 2, 1, 1, 2, 2. Đáp án là 2 đồng (3 + 3). Tham lam chọn 4 + 1 + 1 cần 3 đồng nên không tối ưu.",
        "6. BST cân bằng có chiều cao khoảng log n nên tìm kiếm O(log n). BST suy biến thành danh sách có chiều cao n nên tìm kiếm O(n).",
      ),
    },
    {
      kind: "text",
      folder: "Cheat sheet",
      name: "bang-so-sanh-sap-xep.csv",
      by: "haidang",
      description: "Bảng so sánh các thuật toán sắp xếp: độ phức tạp ba trường hợp, bộ nhớ phụ và tính ổn định.",
      tags: ["sap-xep", "so-sanh", "csv"],
      body: C`
thuat_toan,tot_nhat,trung_binh,xau_nhat,bo_nho_phu,on_dinh
Bubble sort,O(n),O(n²),O(n²),O(1),Có
Selection sort,O(n²),O(n²),O(n²),O(1),Không
Insertion sort,O(n),O(n²),O(n²),O(1),Có
Merge sort,O(n log n),O(n log n),O(n log n),O(n),Có
Quick sort,O(n log n),O(n log n),O(n²),O(log n),Không
Heap sort,O(n log n),O(n log n),O(n log n),O(1),Không
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "sap-xep-merge-quick.js",
      by: "trungkien",
      description: "Cài đặt merge sort và quick sort (partition Lomuto), có kiểm tra kết quả với Array.sort.",
      tags: ["javascript", "sap-xep", "quicksort"],
      body: C`
// Hai thuật toán sắp xếp kinh điển: merge sort và quick sort (partition kiểu Lomuto).

// Merge sort: chia đôi, sắp xếp từng nửa rồi trộn. O(n log n), cần O(n) bộ nhớ phụ, ổn định.
function mergeSort(a) {
  if (a.length <= 1) return a;
  const mid = Math.floor(a.length / 2);
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    // Dùng <= để ổn định: hai phần tử bằng nhau giữ nguyên thứ tự ban đầu
    out.push(left[i] <= right[j] ? left[i++] : right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}

// Partition kiểu Lomuto: pivot là phần tử cuối, trả về vị trí cuối cùng của pivot.
function partition(a, lo, hi) {
  const pivot = a[hi];
  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (a[j] <= pivot) {
      i++;
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  [a[i + 1], a[hi]] = [a[hi], a[i + 1]];
  return i + 1;
}

// Quick sort tại chỗ: trung bình O(n log n), xấu nhất O(n²), không ổn định.
function quickSort(a, lo = 0, hi = a.length - 1) {
  if (lo < hi) {
    const p = partition(a, lo, hi);
    quickSort(a, lo, p - 1);
    quickSort(a, p + 1, hi);
  }
  return a;
}

// --- Chạy tay ví dụ trên lớp: [8, 3, 7, 1, 5], pivot = 5 ---
const demo = [8, 3, 7, 1, 5];
const p = partition(demo, 0, demo.length - 1);
console.log("Sau partition:", demo, "- pivot ở vị trí", p); // [3, 1, 5, 8, 7], vị trí 2
console.assert(JSON.stringify(demo) === "[3,1,5,8,7]" && p === 2, "partition sai");

// --- So với Array.sort trên 200 mảng ngẫu nhiên ---
for (let t = 0; t < 200; t++) {
  const arr = Array.from({ length: Math.floor(Math.random() * 30) }, () => Math.floor(Math.random() * 50) - 10);
  const ref = JSON.stringify([...arr].sort((x, y) => x - y));
  console.assert(JSON.stringify(mergeSort(arr)) === ref, "mergeSort sai với " + arr);
  console.assert(JSON.stringify(quickSort([...arr])) === ref, "quickSort sai với " + arr);
}
console.log("Merge sort và quick sort khớp Array.sort trên 200 mảng ngẫu nhiên.");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "do-thi-bfs-dijkstra.js",
      by: "minhkhoi",
      description: "BFS và Dijkstra (bản dùng mảng O(V²)) trên đồ thị danh sách kề, kèm dựng lại đường đi ngắn nhất.",
      tags: ["javascript", "bfs", "dijkstra"],
      body: C`
// BFS (đường đi ngắn nhất theo số cạnh) và Dijkstra (trọng số không âm) trên đồ thị danh sách kề.
// adj[u] = [[v, w], ...]: đỉnh kề v và trọng số w >= 0 (BFS bỏ qua w).
// dist[v] = số cạnh ngắn nhất từ s tới v, -1 nếu không tới được. Độ phức tạp O(V + E).
function bfs(adj, s) {
  const dist = Array(adj.length).fill(-1);
  dist[s] = 0;
  const queue = [s];
  for (let i = 0; i < queue.length; i++) {
    for (const [v] of adj[queue[i]]) {
      if (dist[v] < 0) {
        dist[v] = dist[queue[i]] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

// Bản dùng mảng: O(V²), hợp đồ thị dày. Đồ thị thưa thì dùng min-heap: O((V + E) log V).
function dijkstra(adj, s) {
  const n = adj.length;
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const done = Array(n).fill(false);
  dist[s] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let v = 0; v < n; v++) {
      if (!done[v] && (u === -1 || dist[v] < dist[u])) u = v; // đỉnh chưa chốt, gần nhất
    }
    if (u === -1 || dist[u] === Infinity) break;
    done[u] = true;
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

const pathTo = (prev, t) => (t === -1 ? [] : [...pathTo(prev, prev[t]), t]);

// Đồ thị vô hướng 5 đỉnh: A=0, B=1, C=2, D=3, E=4
const names = ["A", "B", "C", "D", "E"];
const edges = [[0, 1, 4], [0, 2, 2], [1, 2, 1], [1, 3, 5], [2, 3, 8], [2, 4, 10], [3, 4, 2]];
const adj = names.map(() => []);
edges.forEach(([u, v, w]) => {
  adj[u].push([v, w]);
  adj[v].push([u, w]);
});

const { dist, prev } = dijkstra(adj, 0);
console.log("BFS từ A:", bfs(adj, 0)); // [0, 1, 1, 2, 2]
console.log("Dijkstra từ A:", dist); // [0, 3, 2, 8, 10]
console.log("Đường tới E:", pathTo(prev, 4).map((v) => names[v]).join(" → "));
console.assert(JSON.stringify(bfs(adj, 0)) === "[0,1,1,2,2]", "BFS sai");
console.assert(JSON.stringify(dist) === "[0,3,2,8,10]", "Dijkstra sai");
console.assert(pathTo(prev, 4).map((v) => names[v]).join("") === "ACBDE", "đường đi sai");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "quy-hoach-dong.js",
      by: "tuankiet",
      description: "Bốn bài quy hoạch động kinh điển: leo cầu thang, cái túi 0/1, đổi tiền và LIS, có kiểm tra kết quả.",
      tags: ["javascript", "quy-hoach-dong", "knapsack"],
      body: C`
// Bốn bài quy hoạch động kinh điển. Mỗi bài: định nghĩa dp, công thức truy hồi, base case.

// 1) Leo cầu thang (mỗi bước lên 1 hoặc 2 bậc): f(n) = f(n-1) + f(n-2)
function climbStairs(n) {
  let a = 1; // f(0)
  let b = 1; // f(1)
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}

// 2) Cái túi 0/1, mảng 1 chiều: dp[w] = giá trị lớn nhất với sức chứa w.
// Duyệt w NGƯỢC để mỗi món chỉ được dùng một lần.
function knapsack01(weights, values, W) {
  const dp = Array(W + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    for (let w = W; w >= weights[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
    }
  }
  return dp[W];
}

// 3) Đổi tiền: dp[x] = số đồng ít nhất để tạo x; dp[x] = min(dp[x - c] + 1)
function coinChange(coins, amount) {
  const dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of coins) {
      if (c <= x) dp[x] = Math.min(dp[x], dp[x - c] + 1);
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}

// 4) LIS (dãy con tăng NGẶT dài nhất): dp[i] = độ dài dãy kết thúc tại i, O(n²)
function lis(a) {
  if (a.length === 0) return 0;
  const dp = Array(a.length).fill(1);
  for (let i = 1; i < a.length; i++) {
    for (let j = 0; j < i; j++) {
      if (a[j] < a[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
    }
  }
  return Math.max(...dp);
}

console.log("climbStairs(5) =", climbStairs(5)); // 8
console.log("knapsack =", knapsack01([1, 3, 4, 5], [1, 4, 5, 7], 7)); // 9
console.log("coinChange({1,3,4}, 6) =", coinChange([1, 3, 4], 6)); // 2 (3 + 3), tham lam ra 3 đồng
console.log("LIS =", lis([10, 9, 2, 5, 3, 7, 101, 18])); // 4: [2, 3, 7, 101]

console.assert(climbStairs(5) === 8, "climbStairs sai");
console.assert(knapsack01([1, 3, 4, 5], [1, 4, 5, 7], 7) === 9, "knapsack sai");
console.assert(coinChange([1, 3, 4], 6) === 2, "coinChange sai");
console.assert(coinChange([2], 3) === -1, "không tạo được phải trả -1");
console.assert(lis([10, 9, 2, 5, 3, 7, 101, 18]) === 4, "LIS sai");
console.assert(lis([5, 5, 5]) === 1, "tăng ngặt: toàn số bằng nhau cho 1");
console.assert(lis([]) === 0, "mảng rỗng cho 0");
`,
    },
  ],
};

const backend: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Code mẫu" },
    { name: "Tài liệu tham khảo" },
    { name: "Sprint 5", parent: "Tài liệu tham khảo" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-rest-api-va-ma-trang-thai.pdf",
      by: "quocbao",
      description: "Slide thiết kế REST API: đặt tên tài nguyên, phương thức, mã trạng thái, format lỗi và phân trang.",
      tags: ["rest", "express", "http"],
      theme: "ocean",
      slides: [
        {
          title: "REST API và mã trạng thái HTTP",
          bullets: [
            "Mục tiêu: thiết kế API đặt sân nhất quán",
            "Công nghệ: Express, Prisma, MongoDB",
            "Quy ước chung cả CLB cùng dùng",
            "Sprint 5: API đặt sân thể thao",
          ],
        },
        {
          title: "Đặt tên tài nguyên",
          bullets: [
            "Danh từ số nhiều, không dùng động từ",
            "GET /courts, POST /courts, GET /courts/:id",
            "POST /bookings để tạo lịch đặt",
            "Hành động đặc biệt: POST /bookings/:id/cancel",
          ],
        },
        {
          title: "Phương thức HTTP",
          bullets: [
            "GET đọc dữ liệu, không đổi trạng thái",
            "POST tạo mới",
            "PUT thay thế toàn bộ, idempotent",
            "PATCH cập nhật một phần",
            "DELETE xoá tài nguyên",
          ],
        },
        {
          title: "Mã trạng thái thường dùng",
          bullets: [
            "200 OK, 201 Created (kèm body), 204 No Content",
            "400 dữ liệu sai định dạng",
            "401 chưa đăng nhập; 403 không đủ quyền",
            "404 không tìm thấy; 409 xung đột (trùng giờ)",
            "500 lỗi server: không trả err.message ra client",
          ],
        },
        {
          title: "Format lỗi thống nhất",
          bullets: [
            "{ error: { code, message, details? } }",
            "Cùng một format cho toàn bộ API",
            "Mobile và web chỉ cần parse một kiểu",
            "Zod: trả error.issues dạng { path, message }",
          ],
        },
        {
          title: "Phân trang",
          bullets: [
            "Offset (page/limit): đơn giản, chậm khi offset lớn",
            "Cursor: ổn định khi dữ liệu thay đổi liên tục",
            "Luôn giới hạn limit tối đa, ví dụ 50",
            "Trả total hoặc nextCursor trong response",
          ],
        },
        {
          title: "Middleware lỗi trong Express",
          bullets: [
            "Error handler có 4 tham số, đặt sau các route",
            "Express 4: async handler phải gọi next(err)",
            "Express 5 tự chuyển lỗi từ async handler",
            "Log nội bộ, trả message chung cho lỗi 500",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-jwt-refresh-token-bao-mat.pdf",
      by: "mentortuan",
      description: "Slide xác thực và bảo mật API: access/refresh token, lưu token, băm mật khẩu, rate limit, CORS.",
      tags: ["jwt", "bao-mat", "auth"],
      theme: "slate",
      slides: [
        {
          title: "Xác thực và bảo mật API",
          bullets: [
            "Access token ngắn hạn + refresh token dài hạn",
            "Mật khẩu băm bằng bcrypt hoặc argon2",
            "Validate đầu vào, giới hạn tốc độ, CORS",
            "Mô hình áp dụng cho dự án Sprint 5",
          ],
        },
        {
          title: "Vì sao cần hai loại token?",
          bullets: [
            "JWT là stateless nên khó thu hồi",
            "Access token sống khoảng 15 phút",
            "Refresh token sống khoảng 7 ngày, lưu trong DB",
            "Thu hồi bằng cách xoá refresh token",
          ],
        },
        {
          title: "Lưu token ở đâu?",
          bullets: [
            "Web: refresh token trong cookie httpOnly, Secure, SameSite",
            "Access token giữ trong bộ nhớ của app",
            "localStorage đọc được bằng JS nên rủi ro khi có XSS",
            "Mobile: dùng secure storage (Keychain, Keystore)",
          ],
        },
        {
          title: "Xoay vòng refresh token",
          bullets: [
            "Mỗi lần refresh cấp token mới, huỷ token cũ",
            "Lưu bản hash của refresh token, không lưu plain",
            "Token cũ bị dùng lại: nghi ngờ bị lộ, huỷ cả phiên",
            "Ghi nhận thiết bị và thời điểm đăng nhập",
          ],
        },
        {
          title: "Băm mật khẩu",
          bullets: [
            "Không dùng SHA-256 vì quá nhanh",
            "bcrypt, argon2 cố ý chậm và có salt",
            "bcrypt cost 10–12 là hợp lý",
            "bcrypt chỉ xét 72 byte đầu của mật khẩu",
          ],
        },
        {
          title: "Giới hạn tốc độ và CORS",
          bullets: [
            "Rate limit cho /auth/login, ví dụ 10 lần trong 15 phút",
            "Vượt giới hạn trả 429",
            "Sau proxy: app.set('trust proxy', 1)",
            "CORS chỉ cho origin của FE, không dùng * kèm cookie",
          ],
        },
        {
          title: "Checklist bảo mật",
          bullets: [
            "Validate body và query bằng Zod",
            "Không log mật khẩu hay token",
            "Dùng helmet để đặt header bảo mật",
            "npm audit trong CI; secret nằm ngoài repo",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Tài liệu tham khảo",
      name: "huong-dan-quy-uoc-repo-va-pr.docx",
      by: "quocbao",
      description: "Hướng dẫn quy ước nhánh, commit, pull request, quy trình review, CI và checklist deploy của CLB.",
      tags: ["quy-uoc", "pull-request", "ci"],
      title: "Hướng dẫn quy ước repo và pull request",
      sections: [
        {
          heading: "1. Nhánh và commit",
          bullets: [
            "Nhánh làm việc: feature/<tên-ngắn>, tách từ main",
            "Commit theo Conventional Commits: feat:, fix:, chore:, docs:, test:",
            "Một commit làm một việc, message nói rõ thay đổi gì",
          ],
        },
        {
          heading: "2. Pull request",
          bullets: [
            "PR nhỏ, dưới khoảng 400 dòng; lớn hơn thì tách ra",
            "Mô tả 1–2 câu và nêu chỗ muốn người review nhìn kỹ",
            "Có test cho phần logic mới, đặc biệt là trường hợp biên",
            "Cần CI xanh và ít nhất 1 approve mới được merge",
          ],
        },
        {
          heading: "3. Quy trình review",
          paragraphs: [
            "Mentor có hai khung review cố định mỗi tuần: tối thứ 3 và thứ 6. PR gửi trước 18h hôm đó thì kịp được xem.",
            "Cột Review trên bảng sprint có giới hạn 4 thẻ để PR không dồn lại cuối sprint.",
          ],
        },
        {
          heading: "4. CI trên GitHub Actions",
          bullets: [
            "Các bước: cài bằng npm ci, lint và typecheck, chạy test, npm audit",
            "Test API chạy với MongoDB thật (service container), không mock hết",
            "Cache dependency bằng actions/setup-node với cache: npm",
          ],
        },
        {
          heading: "5. Checklist deploy",
          bullets: [
            "Build image Docker ở local và chạy được",
            "Biến môi trường đủ, cấu hình trên dashboard Railway, không commit vào repo",
            "Endpoint /health trả 200",
            "Chạy prisma db push trên DB production trước khi bật bản mới",
            "Có kế hoạch rollback",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Sprint 5",
      name: "ma-tran-kiem-thu-api-dat-san.xlsx",
      by: "phuongthao",
      description: "Ma trận kiểm thử API đặt sân: endpoint, tình huống, dữ liệu vào, kết quả mong đợi và trạng thái.",
      tags: ["kiem-thu", "api", "sprint-5"],
      sheetName: "Kiểm thử API",
      rows: [
        ["Mã", "Endpoint", "Tình huống", "Dữ liệu vào", "Kết quả mong đợi", "Trạng thái"],
        ["TC-01", "POST /auth/register", "Đăng ký hợp lệ", "Email mới, mật khẩu từ 8 ký tự", "201, không trả mật khẩu", "Đạt"],
        ["TC-02", "POST /auth/register", "Email đã tồn tại", "Email trùng với user cũ", "409, không tạo user thứ hai", "Lỗi"],
        ["TC-03", "POST /auth/login", "Sai mật khẩu", "Email đúng, mật khẩu sai", "401, thông báo chung", "Đạt"],
        ["TC-04", "GET /courts", "limit không hợp lệ", "limit=abc hoặc limit=-1", "400 kèm lỗi theo trường", "Lỗi"],
        ["TC-05", "GET /courts/:id", "Sân không tồn tại", "id hợp lệ nhưng không có trong DB", "404", "Đạt"],
        ["TC-06", "POST /bookings", "Đặt sân còn trống", "courtId, khung giờ chưa ai đặt", "201, status CONFIRMED", "Đạt"],
        ["TC-07", "POST /bookings", "Đặt trùng giờ", "Cùng sân, khung giờ chồng lấn", "409", "Đang sửa"],
        ["TC-08", "POST /bookings", "Chưa đăng nhập", "Thiếu header Authorization", "401", "Đạt"],
        ["TC-09", "POST /bookings/:id/cancel", "Huỷ lịch của người khác", "Token của user khác", "403", "Chưa test"],
        ["TC-10", "POST /auth/login", "Vượt giới hạn tốc độ", "11 lần liên tiếp trong 15 phút", "429", "Chưa test"],
      ],
    },
    {
      kind: "poster",
      folder: "Sprint 5",
      name: "so-do-erd-dat-san-the-thao.png",
      by: "phuocloi",
      description: "Sơ đồ ERD của API đặt sân thể thao: User, Court, Booking, BookingSlot và RefreshToken.",
      tags: ["erd", "prisma", "mongodb"],
      poster: {
        title: "ERD — API đặt sân thể thao",
        subtitle: "Prisma + MongoDB, Sprint 5",
        theme: "ocean",
        sections: [
          {
            head: "User",
            lines: ["id: ObjectId (khoá chính)", "email: String @unique", "passwordHash: String", "role: USER | ADMIN", "createdAt: DateTime"],
          },
          {
            head: "Court",
            lines: ["id: ObjectId", "name, location: String", "pricePerHour: Int (VND)", "isActive: Boolean"],
          },
          {
            head: "Booking",
            lines: ["userId → User", "courtId → Court", "startAt, endAt: DateTime", "status: CONFIRMED | CANCELLED", "@@index([courtId, startAt])"],
          },
          {
            head: "BookingSlot",
            lines: ["bookingId → Booking", "courtId → Court", "slotStart: DateTime", "@@unique([courtId, slotStart])", "Chặn trùng giờ ở tầng DB"],
          },
          {
            head: "RefreshToken",
            lines: ["userId → User", "tokenHash: String", "expiresAt: DateTime", "revokedAt: DateTime?"],
          },
          {
            head: "Quan hệ",
            lines: ["User 1–N Booking", "Court 1–N Booking", "Booking 1–N BookingSlot", "User 1–N RefreshToken"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Tài liệu tham khảo",
      name: "cheat-sheet-http-status-code.png",
      by: "phuongthao",
      description: "Cheat sheet mã trạng thái HTTP hay dùng trong REST API và mẹo nhớ 401/403.",
      tags: ["http", "status-code", "cheat-sheet"],
      poster: {
        title: "Cheat sheet HTTP status code",
        subtitle: "Đừng trả 200 cho mọi thứ",
        theme: "sunset",
        sections: [
          {
            head: "2xx — Thành công",
            lines: ["200 OK: đọc hoặc cập nhật xong", "201 Created: tạo mới, kèm body", "204 No Content: xoá xong"],
          },
          {
            head: "4xx — Lỗi do client (1)",
            lines: ["400 Bad Request: sai định dạng", "401 Unauthorized: chưa đăng nhập", "403 Forbidden: không đủ quyền"],
          },
          {
            head: "4xx — Lỗi do client (2)",
            lines: ["404 Not Found: không tìm thấy", "409 Conflict: xung đột, trùng giờ", "422: đúng cú pháp nhưng sai nghiệp vụ", "429 Too Many Requests: vượt rate limit"],
          },
          {
            head: "5xx — Lỗi phía server",
            lines: ["500 Internal Server Error", "502, 503: cổng lỗi hoặc quá tải", "Không trả err.message cho client", "Log nội bộ để điều tra"],
          },
          {
            head: "Mẹo nhớ nhanh",
            lines: ["401: bạn là ai?", "403: biết bạn rồi nhưng không được vào", "PUT thay thế, PATCH sửa một phần", "Xoá thành công thường trả 204"],
          },
          {
            head: "Format lỗi của CLB",
            lines: ["{ error: { code, message,", "  details? } }", "Cùng một format cho toàn API", "FE chỉ cần parse một kiểu"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Tài liệu tham khảo",
      name: "Cheat sheet Express middleware.md",
      by: "minhanh",
      description: "Cheat sheet middleware Express: thứ tự khai báo, validate Zod, wrapper async và error handler.",
      tags: ["express", "middleware", "cheat-sheet"],
      body: L(
        "# Cheat sheet Express middleware",
        "",
        "Middleware là hàm `(req, res, next)`. Express chạy chúng **theo thứ tự khai báo**.",
        "",
        "## 1. Thứ tự gợi ý",
        "```js",
        "app.use(helmet());               // header bảo mật",
        "app.use(cors({ origin: allowedOrigins })); // allowedOrigins: danh sách origin của FE (từ biến môi trường)",
        "app.use(express.json({ limit: \"100kb\" })); // đọc JSON body",
        "app.use(\"/auth\", loginLimiter);   // rate limit cho /auth",
        "app.use(\"/api/v1\", router);       // các route",
        "app.use(notFound);                // 404 cho route lạ",
        "app.use(errorHandler);            // luôn đặt CUỐI CÙNG",
        "```",
        "",
        "## 2. Validate đầu vào bằng Zod",
        "```js",
        "const validate = (schema) => (req, res, next) => {",
        "  const result = schema.safeParse(req.body);",
        "  if (!result.success) {",
        "    const details = result.error.issues.map((i) => ({ path: i.path.join(\".\"), message: i.message }));",
        "    return res.status(400).json({ error: { code: \"VALIDATION_ERROR\", message: \"Dữ liệu không hợp lệ\", details } });",
        "  }",
        "  req.body = result.data;",
        "  next();",
        "};",
        "```",
        "",
        "## 3. Bọc async handler (Express 4)",
        "```js",
        "const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);",
        "router.get(\"/courts\", wrap(async (req, res) => res.json(await listCourts())));",
        "```",
        "Express 5 tự chuyển lỗi từ async handler sang error handler nên không cần wrapper.",
        "",
        "## 4. Error handler (4 tham số)",
        "```js",
        "app.use((err, req, res, next) => {",
        "  const status = err.status ?? 500;",
        "  if (status >= 500) console.error(err); // log nội bộ",
        "  res.status(status).json({",
        "    error: { code: err.code ?? \"INTERNAL\", message: status >= 500 ? \"Lỗi máy chủ\" : err.message },",
        "  });",
        "});",
        "```",
        "",
        "## 5. Lỗi hay gặp",
        "- Quên `next()` hoặc không trả response: request treo mãi",
        "- Đặt error handler trước route: không bắt được lỗi",
        "- Gọi `res.send` hai lần: lỗi *Cannot set headers after they are sent*",
        "- Sau reverse proxy (Railway) nhớ `app.set(\"trust proxy\", 1)` để rate limit thấy đúng IP",
      ),
    },
    {
      kind: "text",
      folder: "Sprint 5",
      name: "schema-prisma-dat-san.txt",
      by: "phuocloi",
      description: "Schema Prisma cho MongoDB của API đặt sân (lưu thành prisma/schema.prisma khi dùng).",
      tags: ["prisma", "schema", "mongodb"],
      body: C`
// Schema Prisma cho API đặt sân thể thao (Sprint 5), dùng MongoDB. Áp dụng cho Prisma 5–6.
// Lưu thành prisma/schema.prisma, rồi chạy: npx prisma db push && npx prisma generate
// MongoDB không có migrate nên db push là lệnh đồng bộ schema và index.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

enum BookingStatus {
  CONFIRMED
  CANCELLED
}

model User {
  id           String         @id @default(auto()) @map("_id") @db.ObjectId
  email        String         @unique
  passwordHash String
  role         Role           @default(USER)
  createdAt    DateTime       @default(now())
  bookings     Booking[]
  tokens       RefreshToken[]
}

model Court {
  id           String        @id @default(auto()) @map("_id") @db.ObjectId
  name         String
  location     String
  pricePerHour Int
  isActive     Boolean       @default(true)
  bookings     Booking[]
  slots        BookingSlot[]
}

model Booking {
  id        String        @id @default(auto()) @map("_id") @db.ObjectId
  userId    String        @db.ObjectId
  user      User          @relation(fields: [userId], references: [id])
  courtId   String        @db.ObjectId
  court     Court         @relation(fields: [courtId], references: [id])
  startAt   DateTime
  endAt     DateTime
  status    BookingStatus @default(CONFIRMED)
  createdAt DateTime      @default(now())
  slots     BookingSlot[]

  // Truy vấn kiểm tra trùng giờ luôn lọc theo sân + khoảng thời gian
  @@index([courtId, startAt])
}

// Mỗi booking được tách thành các slot 1 giờ. Unique (courtId, slotStart) chặn trùng giờ ở DB.
// Khi huỷ booking nhớ xoá các slot để giải phóng khung giờ.
model BookingSlot {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  bookingId String   @db.ObjectId
  booking   Booking  @relation(fields: [bookingId], references: [id])
  courtId   String   @db.ObjectId
  court     Court    @relation(fields: [courtId], references: [id])
  slotStart DateTime

  @@unique([courtId, slotStart])
}

model RefreshToken {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  userId    String    @db.ObjectId
  user      User      @relation(fields: [userId], references: [id])
  tokenHash String
  expiresAt DateTime
  revokedAt DateTime?
}
`,
    },
    {
      kind: "text",
      folder: "Code mẫu",
      name: "dockerfile-multi-stage.txt",
      by: "giahuy",
      description: "Dockerfile multi-stage cho API Node.js + Prisma (lưu thành file Dockerfile ở thư mục gốc).",
      tags: ["docker", "dockerfile", "deploy"],
      body: C`
# Dockerfile multi-stage cho API Node.js + Prisma. Lưu thành file tên Dockerfile ở thư mục gốc.
# Nhớ tạo .dockerignore gồm: node_modules, .git, .env, dist (đừng đưa .env vào image).

# --- Stage 1: build TypeScript ra thư mục dist ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Stage 2: chỉ giữ thứ cần để chạy (image nhỏ, ít bề mặt tấn công) ---
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Prisma Client đã generate ở stage build
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "jwt-hs256-thu-cong.js",
      by: "quocbao",
      description: "Ký và kiểm tra JWT HS256 bằng node:crypto để hiểu cơ chế (dự án thật dùng thư viện jsonwebtoken).",
      tags: ["javascript", "jwt", "bao-mat"],
      body: C`
// Ký và kiểm tra JWT HS256 bằng node:crypto — CHỈ để hiểu cơ chế.
// Trong dự án thật hãy dùng thư viện đã được kiểm chứng (jsonwebtoken, jose).
const crypto = require("node:crypto");

const b64url = (input) => Buffer.from(input).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url").toString("utf8");
const nowSec = () => Math.floor(Date.now() / 1000);

function sign(payload, secret, expiresInSec = 900) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: nowSec(), exp: nowSec() + expiresInSec };
  const data = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return data + "." + signature;
}

function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token sai định dạng");
  const [h, p, s] = parts;
  const header = JSON.parse(fromB64url(h));
  if (header.alg !== "HS256") throw new Error("Thuật toán không được hỗ trợ"); // chặn alg=none

  const expected = crypto.createHmac("sha256", secret).update(h + "." + p).digest();
  const actual = Buffer.from(s, "base64url");
  // So sánh hằng thời gian để tránh tấn công đo thời gian
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Chữ ký không hợp lệ");
  }
  const payload = JSON.parse(fromB64url(p));
  if (typeof payload.exp !== "number" || payload.exp < nowSec()) throw new Error("Token đã hết hạn");
  return payload;
}

function thu(fn) {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e.message;
  }
}

// Secret demo — ngoài đời phải là chuỗi ngẫu nhiên dài, lấy từ biến môi trường
const SECRET = "demo-secret-chi-de-hoc";
const token = sign({ sub: "user-1", role: "USER" }, SECRET);
console.log("Token:", token);
console.log("Payload:", verify(token, SECRET));

// Sửa payload thành ADMIN nhưng giữ nguyên chữ ký -> phải bị từ chối
const [h, , s] = token.split(".");
const forged = h + "." + b64url(JSON.stringify({ sub: "user-1", role: "ADMIN", exp: nowSec() + 900 })) + "." + s;
console.log("Token bị sửa:", thu(() => verify(forged, SECRET)));

console.assert(verify(token, SECRET).sub === "user-1", "token hợp lệ phải đọc được payload");
console.assert(thu(() => verify(forged, SECRET)) === "Chữ ký không hợp lệ", "token bị sửa phải bị từ chối");
console.assert(thu(() => verify(token, "secret-khac")) === "Chữ ký không hợp lệ", "sai secret phải bị từ chối");
console.assert(thu(() => verify(sign({ sub: "x" }, SECRET, -1), SECRET)) === "Token đã hết hạn", "token hết hạn phải bị từ chối");
`,
    },
    {
      kind: "code",
      folder: "Sprint 5",
      name: "kiem-tra-trung-gio-dat-san.js",
      by: "tuankiet",
      description: "Kiểm tra chồng lấn giờ đặt sân, chia slot 1 giờ và mô phỏng unique (courtId, slotStart) để trả 409.",
      tags: ["javascript", "booking", "overlap"],
      body: C`
// Kiểm tra đặt sân trùng giờ. Hai khoảng [start, end) chồng lấn khi aStart < bEnd và aEnd > bStart.
const overlaps = (a, b) => a.startAt < b.endAt && a.endAt > b.startAt;

const HOUR = 3600 * 1000;

// Tách khoảng thời gian thành các slot 1 giờ liên tiếp (chỉ cho đặt theo giờ tròn).
// Múi giờ Việt Nam (UTC+7) lệch nguyên giờ nên chia theo UTC vẫn tròn giờ.
function toSlots(startAt, endAt) {
  if (!(startAt < endAt)) throw new Error("endAt phải sau startAt");
  if (startAt.getTime() % HOUR !== 0 || endAt.getTime() % HOUR !== 0) throw new Error("Chỉ cho đặt theo giờ tròn");
  const slots = [];
  for (let t = startAt.getTime(); t < endAt.getTime(); t += HOUR) slots.push(new Date(t));
  return slots;
}

// Mô phỏng DB có unique index (courtId, slotStart): insert trùng thì ném lỗi 409.
// Ngoài đời Prisma báo mã P2002; ở đây ta kiểm tra toàn bộ slot rồi mới ghi để "tất cả hoặc không".
class FakeBookingStore {
  constructor() {
    this.keys = new Set();
  }
  book(courtId, startAt, endAt) {
    const slots = toSlots(startAt, endAt);
    const keys = slots.map((s) => courtId + "|" + s.toISOString());
    if (keys.some((k) => this.keys.has(k))) {
      const err = new Error("Sân đã có người đặt");
      err.status = 409;
      throw err;
    }
    keys.forEach((k) => this.keys.add(k));
    return { courtId, startAt, endAt, status: "CONFIRMED" };
  }
}

const at = (h) => new Date(Date.UTC(2026, 0, 15, h)); // ngày 15/1/2026, giờ UTC
const store = new FakeBookingStore();

console.log("A đặt 8h–10h:", store.book("san-1", at(8), at(10)).status);
let status = 0;
try {
  store.book("san-1", at(9), at(11)); // chồng lấn 9h–10h
} catch (e) {
  status = e.status;
}
console.log("B đặt 9h–11h ->", status); // 409
console.log("C đặt 10h–11h:", store.book("san-1", at(10), at(11)).status); // liền kề, không chồng lấn
console.log("D đặt sân khác 9h–10h:", store.book("san-2", at(9), at(10)).status);

console.assert(status === 409, "đặt chồng lấn phải trả 409");
console.assert(!overlaps({ startAt: at(8), endAt: at(10) }, { startAt: at(10), endAt: at(11) }), "liền kề không được tính là trùng");
console.assert(overlaps({ startAt: at(8), endAt: at(10) }, { startAt: at(9), endAt: at(11) }), "9h-10h chồng lấn");
`,
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "phan-trang-cursor.js",
      by: "tuankiet",
      description: "Util phân trang cursor: mã hoá cursor (createdAt, id), giới hạn limit và duyệt hết các trang.",
      tags: ["javascript", "pagination", "cursor"],
      body: C`
// Phân trang bằng cursor trên danh sách sắp xếp theo (createdAt giảm dần, id giảm dần).
// Cursor mã hoá khoá của phần tử cuối trang; trang sau lấy các phần tử "đứng sau" khoá đó.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseLimit(raw) {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    const err = new Error("limit phải là số nguyên từ 1 đến " + MAX_LIMIT);
    err.status = 400;
    throw err;
  }
  return n;
}

const encodeCursor = (item) => Buffer.from(JSON.stringify({ t: item.createdAt, id: item.id })).toString("base64url");
const decodeCursor = (c) => JSON.parse(Buffer.from(c, "base64url").toString("utf8"));

function paginate(items, { limit, cursor } = {}) {
  const size = parseLimit(limit);
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  let rest = sorted;
  if (cursor) {
    const { t, id } = decodeCursor(cursor);
    rest = sorted.filter((x) => x.createdAt < t || (x.createdAt === t && x.id < id));
  }
  const page = rest.slice(0, size);
  const nextCursor = rest.length > size ? encodeCursor(page[page.length - 1]) : null;
  return { items: page, nextCursor };
}

// --- Chạy thử: 12 phần tử, có vài phần tử cùng createdAt ---
const data = Array.from({ length: 12 }, (_, i) => ({ id: "b" + String(i).padStart(2, "0"), createdAt: 1000 + Math.floor(i / 2) }));

const seen = [];
let cursor;
do {
  const res = paginate(data, { limit: 5, cursor });
  seen.push(...res.items.map((x) => x.id));
  cursor = res.nextCursor;
} while (cursor);

console.log("Thứ tự duyệt:", seen.join(", "));
console.assert(seen.length === 12, "phải duyệt đủ 12 phần tử");
console.assert(new Set(seen).size === 12, "không được trùng phần tử giữa các trang");
console.assert(paginate(data, { limit: 12 }).nextCursor === null, "hết dữ liệu thì nextCursor = null");

let status = 0;
try {
  parseLimit("abc");
} catch (e) {
  status = e.status;
}
console.assert(status === 400, "limit=abc phải bị từ chối với 400");
`,
    },
  ],
};

const capstone: WorkspaceResources = {
  folders: [
    { name: "Báo cáo" },
    { name: "Slide bảo vệ" },
    { name: "Thiết kế hệ thống" },
    { name: "Code mẫu" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bảo vệ",
      name: "slide-bao-ve-do-an-ban-nhap.pdf",
      by: "thuhien",
      description: "Bản nháp slide bảo vệ đồ án khoảng 8 trang tóm tắt: đề tài, nghiệp vụ, thiết kế, demo và kết luận.",
      tags: ["bao-ve", "slide", "do-an"],
      theme: "slate",
      slides: [
        {
          title: "Hệ thống quản lý thư viện trường",
          bullets: [
            "Đồ án tốt nghiệp",
            "Web: React + Node/Express + MongoDB",
            "Mượn – trả – phạt trễ hạn – tìm kiếm – thống kê",
            "Nhóm thực hiện và giảng viên hướng dẫn",
          ],
        },
        {
          title: "Bài toán và mục tiêu",
          bullets: [
            "Quản lý thư viện thủ công, dễ sai sót",
            "Mục tiêu: số hoá mượn – trả và tìm kiếm sách",
            "Khảo sát thực tế bằng phỏng vấn thủ thư",
            "Phạm vi: độc giả, thủ thư và quản trị",
          ],
        },
        {
          title: "Yêu cầu và quy tắc nghiệp vụ",
          bullets: [
            "Mượn tối đa 5 cuốn, mỗi lần 14 ngày",
            "Gia hạn 1 lần, thêm 7 ngày",
            "Phạt trễ hạn 2.000đ mỗi ngày mỗi cuốn",
            "Tiền phạt tối đa bằng giá bìa của sách",
          ],
        },
        {
          title: "Phân quyền",
          bullets: [
            "Độc giả: tìm sách, xem phiếu mượn, gia hạn",
            "Thủ thư: quản lý sách, mượn/trả, miễn giảm phạt",
            "Quản trị: quản lý tài khoản thủ thư, xem thống kê",
            "Kiểm tra quyền ở middleware và route guard",
          ],
        },
        {
          title: "Thiết kế cơ sở dữ liệu",
          bullets: [
            "Sach 1–N BanSao; DocGia 1–N PhieuMuon",
            "ChiTietMuon nhúng trong PhieuMuon (tối đa 5)",
            "Phat là collection riêng để thống kê theo kỳ",
            "Text index cho tìm kiếm; maVach, maSV là unique",
          ],
        },
        {
          title: "Kiến trúc hệ thống",
          bullets: [
            "Giao diện React (Vite, MUI, React Query)",
            "REST API Node/Express, xác thực bằng JWT",
            "MongoDB replica set để dùng transaction",
            "Swagger (OpenAPI) làm tài liệu API",
          ],
        },
        {
          title: "Demo và kiểm thử",
          bullets: [
            "Kịch bản: đăng nhập → tìm sách → mượn → trả và tính phạt",
            "Máy quét mã vạch hoạt động như gõ phím + Enter",
            "Kiểm thử: unit (tính phạt), API, e2e luồng thủ thư",
            "Luôn có video demo dự phòng",
          ],
        },
        {
          title: "Kết luận và hướng phát triển",
          bullets: [
            "Hoàn thành luồng mượn – trả – phạt – thống kê",
            "Hạn chế: chưa có tính năng đặt trước",
            "Hướng phát triển: đặt trước, nhắc hạn qua email",
            "Cảm ơn hội đồng đã lắng nghe",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Thiết kế hệ thống",
      name: "slide-quy-tac-nghiep-vu-muon-tra.pdf",
      by: "ngocdiep",
      description: "Slide quy tắc nghiệp vụ mượn – trả: hạn mượn, gia hạn, tính phạt, miễn giảm và xử lý đồng thời.",
      tags: ["nghiep-vu", "muon-tra", "tinh-phat"],
      theme: "amber",
      slides: [
        {
          title: "Quy tắc nghiệp vụ mượn – trả",
          bullets: [
            "Chốt cùng thủ thư thư viện trường",
            "Là phần hội đồng hay hỏi nhất",
            "Mọi hằng số nên cấu hình được",
          ],
        },
        {
          title: "Mượn sách",
          bullets: [
            "Tối đa 5 cuốn cùng lúc",
            "Thời hạn mượn 14 ngày",
            "Chỉ mượn được bản sao đang sẵn sàng",
            "Trả sách: đổi trạng thái bản sao và cập nhật phiếu",
          ],
        },
        {
          title: "Gia hạn",
          bullets: [
            "Gia hạn 1 lần, thêm 7 ngày",
            "Độc giả tự gia hạn trên web nếu chưa có người đặt trước",
            "Thủ thư có thể gia hạn trực tiếp tại quầy",
          ],
        },
        {
          title: "Tính phạt trễ hạn",
          bullets: [
            "soNgayTre = max(0, ngày trả − ngày hẹn trả)",
            "Tính theo ngày lịch ở múi giờ Asia/Ho_Chi_Minh",
            "Tiền phạt = soNgayTre × 2.000đ cho mỗi cuốn",
            "Trần phạt bằng giá bìa của cuốn sách",
          ],
        },
        {
          title: "Miễn giảm và loại phạt",
          bullets: [
            "Thủ thư được miễn hoặc giảm phạt, bắt buộc ghi lý do",
            "Lưu dấu vết kiểm toán (audit)",
            "Loại phạt: TRE_HAN, HU_HONG, MAT_SACH",
            "Vượt trần phạt: thủ thư xử lý thủ công",
          ],
        },
        {
          title: "Xử lý đồng thời",
          bullets: [
            "Hai người cùng mượn một bản sao thì sao?",
            "Cập nhật có điều kiện: trangThai = SAN_SANG",
            "findOneAndUpdate thực hiện nguyên tử",
            "Trả sách dùng transaction: bản sao, phiếu, phạt",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Báo cáo",
      name: "de-cuong-bao-cao-do-an.docx",
      by: "ngoclan",
      description: "Đề cương báo cáo đồ án năm chương: giới thiệu, cơ sở lý thuyết, phân tích thiết kế, triển khai, kết luận.",
      tags: ["bao-cao", "de-cuong", "do-an"],
      title: "Đề cương báo cáo đồ án: Hệ thống quản lý thư viện trường",
      sections: [
        {
          heading: "Chương 1. Giới thiệu đề tài",
          bullets: [
            "Lý do chọn đề tài và thực trạng quản lý thư viện thủ công ở trường",
            "Mục tiêu của hệ thống",
            "Phạm vi và đối tượng sử dụng: độc giả, thủ thư, quản trị",
          ],
        },
        {
          heading: "Chương 2. Cơ sở lý thuyết",
          bullets: [
            "React, Node/Express, REST API",
            "MongoDB: document model, index, transaction đa tài liệu",
            "Xác thực bằng JWT; chỉ viết những gì thực sự dùng trong đề tài",
          ],
        },
        {
          heading: "Chương 3. Phân tích và thiết kế hệ thống",
          bullets: [
            "Yêu cầu chức năng, phi chức năng và quy tắc nghiệp vụ",
            "Bảng phân quyền theo vai trò",
            "ERD và thiết kế collection MongoDB",
            "Kiến trúc tổng thể",
          ],
        },
        {
          heading: "Chương 4. Triển khai và kiểm thử",
          bullets: [
            "Ảnh chụp và mô tả các màn hình: đăng nhập, tìm kiếm, mượn sách, trả sách và tính phạt, thống kê",
            "Xử lý đồng thời và bảo mật (escape regex, token)",
            "Kế hoạch và kết quả kiểm thử theo từng yêu cầu",
          ],
        },
        {
          heading: "Chương 5. Kết luận và hướng phát triển",
          bullets: [
            "Kết quả đạt được so với mục tiêu",
            "Hạn chế hiện tại",
            "Hướng phát triển: đặt trước, nhắc hạn qua email",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Slide bảo vệ",
      name: "kich-ban-demo-bao-ve.docx",
      by: "ngocdiep",
      description: "Kịch bản demo từng bước cho buổi bảo vệ, kèm phương án dự phòng khi mạng hoặc máy chiếu trục trặc.",
      tags: ["demo", "bao-ve", "kich-ban"],
      title: "Kịch bản demo buổi bảo vệ đồ án",
      sections: [
        {
          heading: "1. Chuẩn bị trước buổi demo",
          bullets: [
            "Dữ liệu mẫu sạch: khoảng 200 đầu sách tạo bằng script seed",
            "Chuẩn bị sẵn tài khoản độc giả, thủ thư, quản trị",
            "Mở sẵn các tab cần dùng, kiểm tra máy chiếu và âm thanh",
          ],
        },
        {
          heading: "2. Các bước demo",
          bullets: [
            "Đăng nhập bằng tài khoản độc giả và tìm sách theo tên, tác giả",
            "Đăng nhập thủ thư, quét mã vạch để cho độc giả mượn sách",
            "Trả một cuốn quá hạn để hệ thống tính tiền phạt",
            "Thủ thư miễn giảm phạt kèm lý do",
            "Mở trang thống kê: top sách mượn, độc giả trễ hạn, tiền phạt theo tháng",
          ],
        },
        {
          heading: "3. Phương án dự phòng",
          bullets: [
            "Video demo dài 2–3 phút đã quay sẵn",
            "Ảnh chụp từng màn hình trong slide",
            "Phân công một bạn thao tác, một bạn thuyết minh",
          ],
        },
        {
          heading: "4. Thời lượng",
          paragraphs: [
            "Trình bày khoảng 15 phút và hỏi đáp khoảng 10 phút. Nhóm tập thử ít nhất 2 lần có bấm giờ, lần đầu có thể nói chậm để rà lại nội dung.",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Báo cáo",
      name: "bang-phan-cong-va-tien-do.xlsx",
      by: "ngocdiep",
      description: "Bảng phân công và theo dõi tiến độ báo cáo, backend, giao diện, kiểm thử và slide bảo vệ.",
      tags: ["phan-cong", "tien-do", "do-an"],
      sheetName: "Tiến độ",
      rows: [
        ["Hạng mục", "Phụ trách", "Hạn", "Trạng thái", "Ghi chú"],
        ["Chương 1: Giới thiệu đề tài", "Ngọc Lan", "Thứ 6 tuần trước", "Hoàn thành", "Đã bổ sung thực trạng quản lý thủ công"],
        ["Chương 2: Cơ sở lý thuyết", "Thu", "Thứ 6 tuần này", "Đang làm", "Đang viết phần MongoDB và JWT"],
        ["Chương 3: Phân tích và thiết kế", "Ngọc Lan", "Sau khi có ERD cuối", "Chờ", "Chờ ERD bản cuối từ Phước Lợi"],
        ["Chương 4: Triển khai và kiểm thử", "Ngọc Lan", "Sau khi chốt code", "Chưa bắt đầu", "Cần ảnh chụp màn hình độ phân giải cao"],
        ["ERD và schema MongoDB", "Phước Lợi", "Cuối tuần này", "Đang làm", "Đóng băng schema từ cuối tuần"],
        ["API mượn, trả, gia hạn", "Duy Hưng", "Thứ 6 tuần này", "Đang làm", "Còn gia hạn và phân quyền route"],
        ["Giao diện thủ thư", "Việt Dũng", "Thứ 5 tuần sau", "Đang làm", "Có skeleton loading và trang rỗng"],
        ["Trang tìm kiếm và bộ lọc", "Thu", "Thứ 5 tuần sau", "Đang làm", "Debounce 300ms, giới hạn 100 ký tự"],
        ["Kiểm thử theo yêu cầu", "Phương Thảo", "Song song với code", "Đang làm", "Checklist FR-01 đến FR-12"],
        ["Slide bảo vệ", "Thu Hiền", "Trước buổi tập thử", "Đang làm", "Khoảng 12 slide cho 15 phút nói"],
      ],
    },
    {
      kind: "sheet",
      folder: "Báo cáo",
      name: "ma-tran-truy-vet-yeu-cau.xlsx",
      by: "phuongthao",
      description: "Ma trận truy vết yêu cầu chức năng sang ca kiểm thử chính và kết quả mong đợi.",
      tags: ["kiem-thu", "truy-vet", "yeu-cau"],
      sheetName: "Truy vết",
      rows: [
        ["Mã", "Yêu cầu", "Ca kiểm thử chính", "Kết quả mong đợi", "Trạng thái"],
        ["FR-01", "Quản lý đầu sách và bản sao", "Thêm sách mới kèm 3 bản sao", "Sách hiện trong danh sách, 3 bản sao ở trạng thái sẵn sàng", "Đạt"],
        ["FR-02", "Quản lý độc giả", "Tạo độc giả trùng mã sinh viên", "Báo lỗi trùng maSV", "Đạt"],
        ["FR-03", "Mượn sách", "Mượn cuốn thứ 6 khi đang mượn 5 cuốn", "Báo LOAN_LIMIT_EXCEEDED", "Đạt"],
        ["FR-04", "Mượn sách", "Mượn bản sao đang được mượn", "Báo BOOK_NOT_AVAILABLE", "Đạt"],
        ["FR-05", "Trả sách", "Trả sớm hơn hạn", "Không phát sinh tiền phạt", "Đạt"],
        ["FR-06", "Tính phạt", "Trả trễ 3 ngày", "Phạt 6.000đ cho mỗi cuốn", "Đạt"],
        ["FR-07", "Tính phạt", "Trả lúc 23:59 và 00:01 sát giao ngày", "Tính đúng theo ngày Việt Nam", "Đang kiểm thử"],
        ["FR-08", "Tìm kiếm sách", "Gõ ký tự đặc biệt như ( [ \\ * + ?", "Không lỗi 500, trả danh sách rỗng hoặc kết quả đúng", "Đã sửa"],
        ["FR-09", "Phân quyền", "Độc giả gọi API của thủ thư", "Trả 403", "Chưa test"],
      ],
    },
    {
      kind: "poster",
      folder: "Thiết kế hệ thống",
      name: "erd-v2-quan-ly-thu-vien.png",
      by: "phuocloi",
      description: "ERD phiên bản 2 của hệ thống quản lý thư viện: Sach, BanSao, DocGia, PhieuMuon và Phat.",
      tags: ["erd", "mongodb", "thiet-ke"],
      poster: {
        title: "ERD v2 — Quản lý thư viện",
        subtitle: "Thiết kế collection MongoDB",
        theme: "slate",
        sections: [
          {
            head: "Sach (đầu sách)",
            lines: ["tieuDe, tieuDeKhongDau", "tacGiaIds, theLoaiIds: mảng id", "giaBia: Int", "Text index: tieuDe, tacGia"],
          },
          {
            head: "BanSao (bản vật lý)",
            lines: ["sachId → Sach", "maVach: String, unique", "trangThai: SAN_SANG, DANG_MUON…", "Trạng thái gắn với bản sao"],
          },
          {
            head: "DocGia",
            lines: ["maSV: String, unique", "hoTen, email", "loai: SINH_VIEN | GIANG_VIEN", "1–N PhieuMuon"],
          },
          {
            head: "PhieuMuon",
            lines: ["docGiaId → DocGia", "chiTiet: nhúng, tối đa 5 phần tử", "banSaoId, ngayHenTra, ngayTra", "Index (docGiaId, trangThai)"],
          },
          {
            head: "Phat",
            lines: ["phieuMuonId → PhieuMuon", "lyDo: TRE_HAN | HU_HONG | MAT_SACH", "soTien: Int", "daThanhToan: Boolean"],
          },
          {
            head: "Quan hệ chính",
            lines: ["Sach 1–N BanSao", "DocGia 1–N PhieuMuon", "PhieuMuon 1–N Phat", "Sach N–N TacGia (mảng id)"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Thiết kế hệ thống",
      name: "so-do-kien-truc-he-thong-thu-vien.png",
      by: "duyhung",
      description: "Sơ đồ kiến trúc tổng thể: giao diện React, API Express, nghiệp vụ, MongoDB và bảo mật.",
      tags: ["kien-truc", "so-do", "he-thong"],
      poster: {
        title: "Kiến trúc hệ thống thư viện",
        subtitle: "React → Express → MongoDB",
        theme: "ocean",
        sections: [
          {
            head: "Giao diện (React)",
            lines: ["React + Vite, React Router", "MUI cho component", "axios + React Query", "Trang: tìm sách, mượn/trả, thống kê"],
          },
          {
            head: "API (Node/Express)",
            lines: ["REST dưới tiền tố /api", "JWT cho xác thực", "Phân quyền độc giả, thủ thư, quản trị", "Tài liệu bằng Swagger (OpenAPI)"],
          },
          {
            head: "Nghiệp vụ",
            lines: ["Mượn, trả, gia hạn có transaction", "Tính phạt theo ngày Việt Nam", "Cập nhật có điều kiện chống mượn trùng", "Mã lỗi như BOOK_NOT_AVAILABLE"],
          },
          {
            head: "MongoDB",
            lines: ["Replica set (Atlas hoặc docker)", "sach, banSao, docGia, phieuMuon, phat", "Text index cho tìm kiếm", "Unique: maVach, maSV"],
          },
          {
            head: "Bảo mật",
            lines: ["Escape regex hoặc dùng $text", "Giới hạn độ dài ô tìm kiếm", "Không trả chi tiết lỗi 500", "Băm mật khẩu bằng bcrypt"],
          },
          {
            head: "Thao tác tại quầy",
            lines: ["Máy quét mã vạch như gõ phím + Enter", "Trả sách nhanh bằng mã vạch", "Skeleton loading, trang rỗng", "Video demo dự phòng"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Slide bảo vệ",
      name: "Cau hoi phan bien va tra loi mau.md",
      by: "phuocloi",
      description: "Bộ câu hỏi phản biện thường gặp và gợi ý trả lời ngắn gọn cho buổi bảo vệ đồ án.",
      tags: ["phan-bien", "bao-ve", "hoi-dap"],
      body: L(
        "# Câu hỏi phản biện và gợi ý trả lời",
        "",
        "Trả lời ngắn, có lý do, thừa nhận hạn chế khi cần. Mỗi câu nên gắn với một ví dụ trong chính hệ thống.",
        "",
        "## 1. Vì sao dùng MongoDB cho hệ thống thư viện?",
        "- Dữ liệu dạng tài liệu: phiếu mượn đọc cùng chi tiết nên nhúng `chiTiet` vào `PhieuMuon` (tối đa 5 phần tử, không lo vượt giới hạn 16MB)",
        "- Schema linh hoạt khi thêm thuộc tính cho sách",
        "- Có transaction đa tài liệu (replica set) cho thao tác trả sách",
        "- Hạn chế: không có khoá ngoại, nhóm phải tự đảm bảo toàn vẹn tham chiếu trong service",
        "",
        "## 2. Hai người cùng mượn một bản sao thì xử lý thế nào?",
        "- Dùng cập nhật có điều kiện: `findOneAndUpdate({ _id, trangThai: \"SAN_SANG\" }, { $set: { trangThai: \"DANG_MUON\" } })`",
        "- Thao tác nguyên tử: người đến sau nhận `null` và hệ thống trả lỗi BOOK_NOT_AVAILABLE",
        "",
        "## 3. Bảo mật xác thực được làm ra sao?",
        "- Mật khẩu băm bằng bcrypt; JWT ký bằng bí mật nằm trong biến môi trường",
        "- Phân quyền độc giả, thủ thư, quản trị bằng middleware và route guard",
        "- Escape ký tự đặc biệt khi dùng regex để tránh lỗi 500, NoSQL injection và ReDoS",
        "",
        "## 4. Tiền phạt trễ hạn tính thế nào?",
        "- `soNgayTre = max(0, ngày trả − ngày hẹn trả)` theo ngày lịch ở múi giờ Việt Nam",
        "- Tiền phạt = `soNgayTre × 2.000đ` cho mỗi cuốn, tối đa bằng giá bìa",
        "- Thủ thư được miễn hoặc giảm phạt nhưng phải ghi lý do để có dấu vết kiểm toán",
        "",
        "## 5. Vì sao tách Sach và BanSao?",
        "- Một đầu sách có nhiều bản sao vật lý; trạng thái mượn gắn với từng bản sao",
        "- Cho phép thống kê theo đầu sách mà vẫn quản lý được từng cuốn qua mã vạch",
        "",
        "## 6. Hạn chế và hướng phát triển?",
        "- Chưa có đặt trước (reservation) và hàng đợi",
        "- Có thể thêm nhắc hạn qua email và job quét sách quá hạn hằng đêm (đã có index hỗ trợ)",
      ),
    },
    {
      kind: "code",
      folder: "Code mẫu",
      name: "tinh-phat-tre-han.js",
      by: "duyhung",
      description: "Hàm tính tiền phạt trả sách trễ hạn theo ngày lịch ở múi giờ Việt Nam, có trần bằng giá bìa.",
      tags: ["javascript", "tinh-phat", "mui-gio"],
      body: C`
// Tính tiền phạt trả sách trễ hạn theo NGÀY LỊCH ở múi giờ Việt Nam (UTC+7).
// Quy tắc: 2.000đ / ngày / cuốn, tối đa bằng giá bìa của cuốn sách.
const MUC_PHAT_MOI_NGAY = 2000;
const GIO_VN = 7 * 3600 * 1000;
const MOT_NGAY = 24 * 3600 * 1000;

// Quy một thời điểm (Date lưu UTC) về "số ngày từ epoch" theo giờ VN: cộng 7 giờ rồi lấy phần ngày.
const toNgayVN = (date) => Math.floor((date.getTime() + GIO_VN) / MOT_NGAY);

function soNgayTre(ngayHenTra, ngayTra) {
  return Math.max(0, toNgayVN(ngayTra) - toNgayVN(ngayHenTra));
}

function tinhPhat(ngayHenTra, ngayTra, giaBia) {
  const tien = soNgayTre(ngayHenTra, ngayTra) * MUC_PHAT_MOI_NGAY;
  return Math.min(tien, giaBia); // trần phạt = giá bìa
}

// --- Chạy thử ---
const hen = new Date("2026-03-10T10:00:00+07:00");
const gia = 52000;

console.log("Trả đúng ngày 23:59:", tinhPhat(hen, new Date("2026-03-10T23:59:00+07:00"), gia)); // 0
console.log("Trả lúc 00:01 hôm sau:", tinhPhat(hen, new Date("2026-03-11T00:01:00+07:00"), gia)); // 2000
console.log("Trễ 3 ngày:", tinhPhat(hen, new Date("2026-03-13T09:00:00+07:00"), gia)); // 6000
console.log("Trễ 3 ngày, giá bìa 5000:", tinhPhat(hen, new Date("2026-03-13T09:00:00+07:00"), 5000)); // 5000
console.log("Trả sớm:", tinhPhat(hen, new Date("2026-03-08T09:00:00+07:00"), gia)); // 0

console.assert(tinhPhat(hen, new Date("2026-03-10T23:59:00+07:00"), gia) === 0, "cùng ngày không bị phạt");
console.assert(tinhPhat(hen, new Date("2026-03-11T00:01:00+07:00"), gia) === 2000, "qua nửa đêm là trễ 1 ngày");
console.assert(tinhPhat(hen, new Date("2026-03-13T09:00:00+07:00"), gia) === 6000, "trễ 3 ngày là 6000");
console.assert(tinhPhat(hen, new Date("2026-03-13T09:00:00+07:00"), 5000) === 5000, "phạt tối đa bằng giá bìa");
console.assert(tinhPhat(hen, new Date("2026-03-08T09:00:00+07:00"), gia) === 0, "trả sớm không phạt");
// 00:30 sáng ngày 5 (giờ VN) là 17:30 UTC ngày 4: vẫn phải tính là ngày 5
console.assert(
  toNgayVN(new Date("2026-03-04T17:30:00Z")) === toNgayVN(new Date("2026-03-05T00:00:00+07:00")),
  "phải quy về ngày Việt Nam",
);
`,
    },
    {
      kind: "text",
      folder: "Code mẫu",
      name: "sach-mau.csv",
      by: "thuhien",
      description: "Danh sách 10 đầu sách mẫu (mã, tên, tác giả, thể loại, giá bìa) để nạp dữ liệu demo.",
      tags: ["csv", "du-lieu-mau", "sach"],
      body: C`
maSach,tieuDe,tacGia,theLoai,giaBia
S001,Dế Mèn phiêu lưu ký,Tô Hoài,Thiếu nhi,52000
S002,Truyện Kiều,Nguyễn Du,Văn học Việt Nam,68000
S003,Số đỏ,Vũ Trọng Phụng,Văn học Việt Nam,75000
S004,Lão Hạc,Nam Cao,Văn học Việt Nam,45000
S005,Tôi thấy hoa vàng trên cỏ xanh,Nguyễn Nhật Ánh,Tiểu thuyết,89000
S006,Nhà giả kim,Paulo Coelho,Tiểu thuyết,79000
S007,Sapiens: Lược sử loài người,Yuval Noah Harari,Lịch sử,189000
S008,Clean Code,Robert C. Martin,Công nghệ thông tin,320000
S009,The Pragmatic Programmer,Andrew Hunt và David Thomas,Công nghệ thông tin,350000
S010,Introduction to Algorithms,Thomas H. Cormen và cộng sự,Công nghệ thông tin,650000
`,
    },
    {
      kind: "text",
      folder: "Thiết kế hệ thống",
      name: "ma-loi-api-thu-vien.json",
      by: "duyhung",
      description: "Danh sách mã lỗi API mẫu (code, HTTP status, thông báo) dùng chung cho giao diện và phụ lục báo cáo.",
      tags: ["api", "ma-loi", "json"],
      body: C`
{
  "format": { "error": { "code": "BOOK_NOT_AVAILABLE", "message": "Bản sao này đang được mượn" } },
  "errors": [
    { "code": "BOOK_NOT_AVAILABLE", "status": 409, "message": "Bản sao này đang được mượn hoặc chưa sẵn sàng" },
    { "code": "LOAN_LIMIT_EXCEEDED", "status": 409, "message": "Độc giả đã mượn tối đa 5 cuốn" },
    { "code": "RENEW_LIMIT_REACHED", "status": 409, "message": "Phiếu mượn đã được gia hạn 1 lần" },
    { "code": "VALIDATION_ERROR", "status": 400, "message": "Dữ liệu gửi lên không hợp lệ" },
    { "code": "UNAUTHORIZED", "status": 401, "message": "Chưa đăng nhập hoặc phiên đã hết hạn" },
    { "code": "FORBIDDEN", "status": 403, "message": "Không đủ quyền thực hiện thao tác này" },
    { "code": "NOT_FOUND", "status": 404, "message": "Không tìm thấy dữ liệu yêu cầu" }
  ]
}
`,
    },
  ],
};

const uiux: WorkspaceResources = {
  folders: [
    { name: "Slide bài giảng" },
    { name: "Đồ án app Học nhóm" },
    { name: "Design system" },
    { name: "Tài liệu tham khảo" },
  ],
  files: [
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-4-nguyen-ly-thiet-ke.pdf",
      by: "thuhien",
      description: "Slide 4 nguyên lý thiết kế giao diện: contrast, hierarchy, alignment, proximity, lưới 8pt và vùng chạm.",
      tags: ["nguyen-ly", "contrast", "hierarchy"],
      theme: "rose",
      slides: [
        {
          title: "4 nguyên lý thiết kế giao diện",
          bullets: [
            "Contrast — Hierarchy — Alignment — Proximity",
            "Áp dụng được cho mọi màn hình",
            "Mỗi nguyên lý có ví dụ trước và sau",
            "Bài tập: phân tích một màn hình app",
          ],
        },
        {
          title: "Contrast (tương phản)",
          bullets: [
            "Tạo điểm nhấn và giúp chữ dễ đọc",
            "WCAG AA: chữ thường ≥ 4.5:1, chữ lớn ≥ 3:1",
            "Xám #999999 trên nền trắng chỉ khoảng 2.85:1: không đạt",
            "Xám #767676 trên nền trắng khoảng 4.54:1: vừa đạt",
          ],
        },
        {
          title: "Hierarchy (thứ bậc)",
          bullets: [
            "Dẫn mắt người dùng theo thứ tự quan trọng",
            "Công cụ: kích thước, màu, độ đậm, vị trí, khoảng trắng",
            "Nút chính màu đặc, nút phụ chỉ viền hoặc dạng text",
            "Ví dụ: số dư tài khoản đặt to ở trên cùng",
          ],
        },
        {
          title: "Alignment (căn hàng)",
          bullets: [
            "Mọi thứ thẳng hàng trông gọn và đáng tin",
            "Dùng layout grid hoặc guide",
            "Căn trái cho đoạn chữ dài",
            "Hạn chế trộn nhiều kiểu căn trong một màn hình",
          ],
        },
        {
          title: "Proximity (gần gũi)",
          bullets: [
            "Cái liên quan để gần nhau, không liên quan thì tách ra",
            "Nhãn Email nằm sát ô nhập email",
            "Dùng khoảng trắng thay cho đường kẻ",
            "Gom nhóm bằng thẻ (card) khi cần",
          ],
        },
        {
          title: "Lưới 8pt và khoảng cách",
          bullets: [
            "Khoảng cách là bội của 8: 8, 16, 24, 32",
            "Padding trong thẻ tối thiểu 16",
            "Khoảng cách trong nhóm nhỏ hơn giữa các nhóm",
            "Giúp bàn giao cho dev dễ hơn",
          ],
        },
        {
          title: "Vùng chạm và trợ năng",
          bullets: [
            "Vùng chạm tối thiểu: Android 48dp, iOS 44pt",
            "Nút cần đủ trạng thái hover, focus, disabled",
            "Không chỉ dùng màu để truyền tải thông tin",
            "Kiểm tra bằng plugin Contrast trong Figma",
          ],
        },
      ],
    },
    {
      kind: "slides",
      folder: "Slide bài giảng",
      name: "slide-nghien-cuu-nguoi-dung-persona-flow.pdf",
      by: "thaonguyen",
      description: "Slide nghiên cứu người dùng: phỏng vấn, gom insight, persona, user flow và usability test.",
      tags: ["ux-research", "persona", "usability"],
      theme: "violet",
      slides: [
        {
          title: "Nghiên cứu người dùng",
          bullets: [
            "Quy trình: Phỏng vấn → Insight → Persona → Flow",
            "Tiếp theo: Wireframe → Test",
            "Hiểu người dùng trước khi vẽ",
            "Áp dụng cho đồ án app Học nhóm",
          ],
        },
        {
          title: "Phỏng vấn người dùng",
          bullets: [
            "Hỏi câu mở, hỏi về trải nghiệm thật",
            "Ví dụ: Lần gần nhất bạn học nhóm thế nào?",
            "Tránh câu giả định: Bạn có thích tính năng X?",
            "Hỏi Tại sao? vài lần để đào sâu",
          ],
        },
        {
          title: "Gom insight",
          bullets: [
            "Ghi lại trích dẫn nguyên văn",
            "Affinity map: gom ghi chú theo chủ đề",
            "Tìm nỗi đau lặp lại ở nhiều người",
            "Mỗi insight gắn với một cơ hội thiết kế",
          ],
        },
        {
          title: "Persona",
          bullets: [
            "Gồm tên, độ tuổi, mục tiêu, nỗi đau, thói quen",
            "Dựa trên phỏng vấn thật, không bịa",
            "Ví dụ: Minh, sinh viên năm 2 hay quên deadline",
            "Ảnh minh hoạ không bắt buộc",
          ],
        },
        {
          title: "User flow",
          bullets: [
            "Vẽ đường đi từ mục tiêu đến lúc hoàn thành",
            "Ví dụ: mở app → vào nhóm → nhận việc",
            "Giai đoạn đầu vẽ trên giấy hoặc FigJam",
            "Chốt rồi mới vẽ gọn trên Figma",
          ],
        },
        {
          title: "Usability test",
          bullets: [
            "5 người cho mỗi nhóm người dùng là đủ thấy lỗi lớn",
            "Viết 3–5 task cụ thể, đừng hướng dẫn trước",
            "Quan sát chỗ ngập ngừng, ghi lại, đừng giải thích",
            "Test nhiều vòng nhỏ thay vì một vòng lớn",
          ],
        },
        {
          title: "Ghi nhận và ưu tiên lỗi",
          bullets: [
            "Lập bảng lỗi theo mức độ nghiêm trọng",
            "Sửa lỗi nặng và lỗi nhiều người gặp trước",
            "Test lại sau mỗi lần sửa",
            "Lưu kết quả vào bảng usability test của nhóm",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Đồ án app Học nhóm",
      name: "bien-ban-critique-tuan-3.docx",
      by: "khanhlinh",
      description: "Biên bản buổi critique tuần 3: nội dung góp ý, việc cần làm và nguyên tắc góp ý nhẹ nhàng.",
      tags: ["critique", "bien-ban", "do-an"],
      title: "Biên bản buổi critique tuần 3",
      sections: [
        {
          heading: "1. Thông tin buổi họp",
          paragraphs: [
            "Tối thứ 5, 20h, họp qua phòng voice Phòng critique. Người ghi biên bản: Khánh Linh. Chủ đề chính: wireframe Đăng nhập, bảng màu pastel và màn hình Chat nhóm.",
          ],
        },
        {
          heading: "2. Nội dung góp ý",
          bullets: [
            "Wireframe Đăng nhập: thêm link Quên mật khẩu sát ô mật khẩu và nút hiện/ẩn mật khẩu",
            "Bảng màu pastel: cần kiểm tra chữ nhỏ đạt tương phản 4.5:1 trên nền trắng và nền kem hồng",
            "Màn hình Chat: bong bóng chat hai màu, tin của mình dính phải",
            "Design system: đặt tên token theo vai trò (primary, surface, text-muted) thay vì theo màu",
          ],
        },
        {
          heading: "3. Việc cần làm",
          bullets: [
            "Thanh Thảo: cập nhật wireframe Đăng nhập theo góp ý",
            "Thùy Trang: đổi tên token theo vai trò và gửi bảng màu bản 2",
            "Thu: hoàn tất wireframe Home, chừa chỗ cho khối việc hôm nay",
            "Khánh Linh: cập nhật feedback vào các thẻ trên bảng đồ án",
          ],
        },
        {
          heading: "4. Nguyên tắc critique của nhóm",
          bullets: [
            "Nêu cái hay trước rồi mới nêu điểm cần cải thiện",
            "Mỗi bài gửi kèm 1–2 câu mô tả mục tiêu thiết kế",
            "Dùng ảnh hay tài nguyên có bản quyền thì ghi rõ nguồn",
          ],
        },
      ],
    },
    {
      kind: "doc",
      folder: "Tài liệu tham khảo",
      name: "template-persona-1-trang.docx",
      by: "thuhien",
      description: "Template persona một trang kèm ví dụ Minh, sinh viên năm 2 hay quên deadline, cho đồ án app Học nhóm.",
      tags: ["persona", "template", "ux"],
      title: "Template persona một trang (kèm ví dụ)",
      sections: [
        {
          heading: "1. Thông tin cơ bản",
          paragraphs: [
            "Ví dụ: Minh, 20 tuổi, sinh viên năm 2 ngành Công nghệ thông tin, thường làm bài nhóm cùng 3–4 bạn.",
          ],
        },
        {
          heading: "2. Mục tiêu",
          bullets: [
            "Nộp bài nhóm đúng hạn mà không phải nhắc từng người",
            "Biết ngay hôm nay mình cần làm gì",
          ],
        },
        {
          heading: "3. Nỗi đau",
          bullets: [
            "Thông tin rải rác ở nhiều nhóm chat nên hay quên deadline",
            "Chia việc xong nhưng không ai biết ai đang làm gì",
            "Họp online xong thường quên ai nhận việc nào",
          ],
        },
        {
          heading: "4. Thói quen và công cụ",
          bullets: [
            "Dùng nhóm chat để trao đổi và ghi chú trên điện thoại",
            "Hay làm bài vào buổi tối, gần sát hạn",
          ],
        },
        {
          heading: "5. Câu trích dẫn",
          paragraphs: [
            "“Mình quên deadline vì mỗi nhóm nhắn một chỗ.” — rút ra từ buổi phỏng vấn nhanh, nên thay bằng câu của người được phỏng vấn thật khi dùng template.",
          ],
        },
      ],
    },
    {
      kind: "sheet",
      folder: "Đồ án app Học nhóm",
      name: "bang-ghi-loi-usability-test.xlsx",
      by: "khanhlinh",
      description: "Bảng ghi lỗi usability test 5 người trên prototype: task, vấn đề, mức độ nghiêm trọng và đề xuất sửa.",
      tags: ["usability", "kiem-thu", "ux"],
      sheetName: "Usability test",
      rows: [
        ["Mã", "Task", "Người test", "Vấn đề quan sát", "Mức độ (0–4)", "Đề xuất", "Trạng thái"],
        ["U-01", "Tạo nhóm mới", "Người test 1", "Không tìm thấy nút tạo nhóm trên Home", "3", "Đưa nút + lên góc phải dưới", "Đã sửa"],
        ["U-02", "Tạo nhóm mới", "Người test 3", "Nhầm nút Tạo nhóm với Tham gia nhóm", "2", "Đổi nhãn và màu của hai nút", "Đang sửa"],
        ["U-03", "Thêm việc vào bảng", "Người test 2", "Không hiểu cột Review nghĩa là gì", "2", "Thêm mô tả ngắn dưới tên cột", "Chưa sửa"],
        ["U-04", "Thêm việc vào bảng", "Người test 4", "Nút Lưu bị bàn phím che mất", "4", "Cho vùng nút đi theo bàn phím", "Đã sửa"],
        ["U-05", "Gửi tin trong chat", "Người test 5", "Không biết tin đã gửi được hay chưa", "3", "Hiện trạng thái đang gửi và đã gửi", "Đang sửa"],
        ["U-06", "Đăng nhập", "Người test 1", "Không thấy nút hiện/ẩn mật khẩu", "1", "Thêm icon con mắt", "Đã sửa"],
        ["U-07", "Đăng nhập", "Người test 3", "Chữ placeholder quá nhạt", "2", "Tăng độ đậm để đạt 4.5:1", "Đã sửa"],
      ],
    },
    {
      kind: "poster",
      folder: "Design system",
      name: "bang-mau-pastel-hoc-nhom.png",
      by: "thuytrang",
      description: "Bảng màu pastel của app Học nhóm cho giao diện sáng và tối, kèm tỉ lệ tương phản đã kiểm tra.",
      tags: ["bang-mau", "pastel", "design-system"],
      poster: {
        title: "Bảng màu pastel — app Học nhóm",
        subtitle: "Token theo vai trò, đã kiểm tra WCAG",
        theme: "rose",
        sections: [
          {
            head: "Nền sáng",
            lines: ["bg: #FFFFFF", "surface: #FFF0F6 (hồng kem)", "primary-soft: #FFDEEB", "Dùng cho màn hình, thẻ, vùng nhấn nhẹ"],
          },
          {
            head: "Chữ trên nền sáng",
            lines: ["text: #2B2B3A — 13.9:1 trên trắng", "text-muted: #5F5B73 — 6.5:1 trên trắng", "Trên surface vẫn đạt 5.9:1", "Chữ thường cần ≥ 4.5:1"],
          },
          {
            head: "Màu nhấn",
            lines: ["primary: #E64980 — 3.7:1", "Chỉ dùng cho icon, nút to, chữ lớn", "primary-strong: #C2255C — 5.7:1", "Nút có chữ trắng nhỏ: dùng primary-strong"],
          },
          {
            head: "Màu phụ",
            lines: ["accent: #7950F2 — 4.95:1 trên trắng", "Dùng cho liên kết, nhãn, huy hiệu", "Không dùng cho chữ nhỏ trên nền hồng"],
          },
          {
            head: "Chế độ tối",
            lines: ["bg: #1B1826, surface: #262235", "text: #E8E6F2 — 14.1:1 trên nền", "text-muted: #B8B3CC — 8.6:1", "primary: #FF8FB8 — 8.2:1"],
          },
          {
            head: "Quy tắc dùng màu",
            lines: ["Tối đa 1 màu nhấn mỗi màn hình", "Không chỉ dùng màu để báo lỗi", "Đặt tên theo vai trò, không theo màu", "Kiểm tra bằng plugin Contrast"],
          },
        ],
      },
    },
    {
      kind: "poster",
      folder: "Tài liệu tham khảo",
      name: "10-nguyen-tac-nielsen.png",
      by: "thaonguyen",
      description: "Poster 10 nguyên tắc usability của Nielsen, mỗi nguyên tắc kèm giải thích ngắn tiếng Việt.",
      tags: ["nielsen", "heuristic", "usability"],
      poster: {
        title: "10 nguyên tắc của Nielsen",
        subtitle: "Dùng để rà soát màn hình trước khi test",
        theme: "violet",
        sections: [
          {
            head: "Nguyên tắc 1–2",
            lines: ["1. Visibility of system status", "Luôn cho biết hệ thống đang làm gì", "2. Match between system and real world", "Dùng ngôn ngữ người dùng hiểu"],
          },
          {
            head: "Nguyên tắc 3–4",
            lines: ["3. User control and freedom", "Cho hoàn tác và thoát dễ dàng", "4. Consistency and standards", "Nhất quán, theo chuẩn nền tảng"],
          },
          {
            head: "Nguyên tắc 5–6",
            lines: ["5. Error prevention", "Ngăn lỗi trước khi xảy ra", "6. Recognition rather than recall", "Hiện sẵn lựa chọn, đỡ phải nhớ"],
          },
          {
            head: "Nguyên tắc 7–8",
            lines: ["7. Flexibility and efficiency of use", "Có lối tắt cho người dùng quen", "8. Aesthetic and minimalist design", "Bỏ thông tin thừa"],
          },
          {
            head: "Nguyên tắc 9–10",
            lines: ["9. Recognize, diagnose, recover from errors", "Báo lỗi rõ và gợi ý cách sửa", "10. Help and documentation", "Hướng dẫn ngắn gọn, dễ tìm"],
          },
        ],
      },
    },
    {
      kind: "text",
      folder: "Tài liệu tham khảo",
      name: "Cheat sheet Figma phim tat.md",
      by: "thuhien",
      description: "Phím tắt Figma hay dùng, ghi chú auto layout, component và mẹo Smart animate cho cả nhóm.",
      tags: ["figma", "phim-tat", "cheat-sheet"],
      body: L(
        "# Cheat sheet Figma: phím tắt và ghi chú",
        "",
        "Phím tắt theo Windows. Trên macOS thay `Ctrl` bằng `Cmd` và `Alt` bằng `Option`.",
        "",
        "## 1. Công cụ cơ bản",
        "| Phím | Việc làm |",
        "| --- | --- |",
        "| `V` | Move (di chuyển/chọn) |",
        "| `F` | Frame |",
        "| `R` | Hình chữ nhật |",
        "| `O` | Hình elip |",
        "| `L` | Đường thẳng |",
        "| `T` | Văn bản |",
        "| `P` | Pen |",
        "| `H` | Hand (kéo canvas) |",
        "| `C` | Comment |",
        "",
        "## 2. Thao tác thường dùng",
        "| Phím | Việc làm |",
        "| --- | --- |",
        "| `Shift + A` | Thêm auto layout |",
        "| `Ctrl + Alt + K` | Tạo component |",
        "| `Ctrl + Alt + B` | Detach instance (tách khỏi component) |",
        "| `Ctrl + D` | Nhân đôi |",
        "| `Ctrl + G` / `Ctrl + Shift + G` | Group / Ungroup |",
        "| `Ctrl + Alt + G` | Bọc phần chọn trong frame |",
        "| `Shift + 1` / `Shift + 2` | Zoom vừa toàn bộ / vừa vùng chọn |",
        "| `Shift + D` | Bật Dev Mode |",
        "",
        "## 3. Auto layout trong 3 ý",
        "- Hướng (ngang/dọc), `gap` và `padding` — rất giống flexbox của CSS",
        "- Resizing: **Hug contents** (ôm nội dung), **Fill container** (giãn đầy khung cha), **Fixed** (cố định)",
        "- Nút bấm: Hug contents + padding ngang 16, dọc 8; muốn nút rộng bằng form thì Fill container",
        "",
        "## 4. Component và variant",
        "- Component là bản gốc, instance là bản sao liên kết; sửa gốc thì mọi instance đổi theo",
        "- Variants gom nhiều trạng thái của một component (Default, Hover, Disabled)",
        "- Component properties gồm Variant, Boolean, Text và Instance swap",
        "",
        "## 5. Frame hay group?",
        "Frame có kích thước riêng, hỗ trợ constraints, auto layout, clip content và layout grid. Group chỉ gom các layer. Thiết kế màn hình thì luôn bắt đầu từ frame.",
        "",
        "## 6. Smart animate",
        "Các layer giữa hai frame phải có **tên giống nhau** thì Figma mới tự nội suy chuyển động. Giữ animation dưới 300ms để không gây chói mắt.",
      ),
    },
    {
      kind: "code",
      folder: "Design system",
      name: "design-tokens.css",
      by: "thuytrang",
      description: "Token CSS của app Học nhóm: màu theo vai trò, chế độ tối, lưới 8pt, bo góc, cỡ chữ và nút có focus rõ.",
      tags: ["css", "design-tokens", "dark-mode"],
      body: C`
/* Design tokens của app Học nhóm. Đặt tên theo VAI TRÒ (primary, surface, text), không theo màu. */
:root {
  /* Màu: tỉ lệ tương phản đã kiểm tra theo WCAG AA */
  --color-bg: #ffffff;
  --color-surface: #fff0f6;
  --color-primary: #e64980; /* chỉ cho icon, nút to, chữ lớn (3.7:1 trên trắng) */
  --color-primary-strong: #c2255c; /* nút có chữ trắng nhỏ (5.7:1 trên trắng) */
  --color-primary-soft: #ffdeeb;
  --color-accent: #7950f2;
  --color-text: #2b2b3a; /* 13.9:1 trên trắng */
  --color-text-muted: #5f5b73; /* 6.5:1 trên trắng, 5.9:1 trên surface */
  --color-on-primary: #ffffff;

  /* Khoảng cách theo lưới 8pt, bo góc, thời gian animation */
  --space-1: 8px;
  --space-2: 16px;
  --radius: 16px;
  --motion-fast: 200ms; /* animation dưới 300ms */
}

/* Chế độ tối: chỉ đổi giá trị token, không đổi tên token */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1b1826;
    --color-surface: #262235;
    --color-primary: #ff8fb8;
    --color-primary-strong: #ff8fb8;
    --color-primary-soft: #3a2a3f;
    --color-accent: #b197fc;
    --color-text: #e8e6f2;
    --color-text-muted: #b8b3cc;
    --color-on-primary: #1b1826;
  }
}

body { margin: 0; background: var(--color-bg); color: var(--color-text); font: 1rem/1.5 system-ui, sans-serif; }

.card {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: var(--space-2); /* padding thẻ tối thiểu 16 */
}
.button-primary {
  min-height: 48px; /* vùng chạm tối thiểu 48dp */
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: 12px;
  background: var(--color-primary-strong);
  color: var(--color-on-primary);
  transition: transform var(--motion-fast) ease;
}
.button-primary:hover { transform: translateY(-1px); }
.button-primary:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .button-primary { transition: none; }
}
`,
    },
    {
      kind: "text",
      folder: "Đồ án app Học nhóm",
      name: "Kich ban phong van nguoi dung.md",
      by: "thaonguyen",
      description: "Kịch bản phỏng vấn người dùng 20 phút: câu mở đầu, câu hỏi về trải nghiệm thật, cách hỏi sâu và ghi chép.",
      tags: ["phong-van", "ux-research", "kich-ban"],
      body: L(
        "# Kịch bản phỏng vấn người dùng (20 phút)",
        "",
        "Mục tiêu: hiểu cách sinh viên đang học nhóm hiện nay để thiết kế app Học nhóm. Không giới thiệu giải pháp, không dẫn dắt câu trả lời.",
        "",
        "## 1. Mở đầu (2 phút)",
        "- Cảm ơn và giải thích: đây không phải bài kiểm tra, không có câu trả lời đúng hay sai",
        "- Xin phép ghi chú (hoặc ghi âm) và cam kết ẩn danh",
        "",
        "## 2. Khởi động (3 phút)",
        "- Bạn đang học năm mấy, ngành gì?",
        "- Một tuần bạn làm bài nhóm khoảng mấy lần?",
        "",
        "## 3. Trải nghiệm thật (10 phút)",
        "Hỏi về lần gần nhất, tránh câu giả định.",
        "- Hãy kể về lần gần nhất bạn làm bài nhóm, từ lúc nhận đề đến lúc nộp.",
        "- Nhóm bạn chia việc như thế nào? Bạn biết mình cần làm gì bằng cách nào?",
        "- Bạn dùng công cụ gì để trao đổi, lưu tài liệu, nhắc hạn?",
        "- Có lần nào bạn quên việc hoặc nộp trễ không? Chuyện gì đã xảy ra?",
        "- Điều gì khiến bạn bực nhất khi học nhóm?",
        "",
        "## 4. Hỏi sâu",
        "- Tại sao vậy? Bạn có thể kể cụ thể hơn không?",
        "- Khi đó bạn đã làm gì tiếp theo?",
        "- Im lặng vài giây sau khi người được hỏi trả lời: họ thường nói thêm",
        "",
        "## 5. Kết thúc (3 phút)",
        "- Còn điều gì bạn muốn chia sẻ mà mình chưa hỏi?",
        "- Cảm ơn và xin phép liên hệ lại nếu cần hỏi thêm",
        "",
        "## 6. Ghi chép",
        "- Ghi trích dẫn nguyên văn, đánh dấu cảm xúc (bực, lo, hài lòng)",
        "- Sau buổi phỏng vấn, gom ghi chú vào affinity map theo chủ đề",
        "- Cần khoảng 5 người cho mỗi nhóm người dùng để thấy các nỗi đau lặp lại",
      ),
    },
    {
      kind: "text",
      folder: "Đồ án app Học nhóm",
      name: "tom-tat-phong-van-5-ban.csv",
      by: "ducanh",
      description: "Bảng tóm tắt insight từ buổi phỏng vấn nhanh 5 bạn sinh viên về cách học nhóm hiện tại.",
      tags: ["phong-van", "insight", "csv"],
      body: C`
ma,doi_tuong,tinh_huong,trich_dan,insight
P1,SV năm 2,Làm bài nhóm,"Mình quên deadline vì mỗi nhóm nhắn một chỗ",Thông tin rải rác ở nhiều nơi
P2,SV năm 3,Chia việc,"Chia việc xong là không ai biết ai đang làm gì",Thiếu nơi xem tiến độ chung
P2,SV năm 3,Nộp bài,"Sát hạn mới thấy có người chưa làm phần của mình",Cần nhắc việc trước hạn
P3,SV năm 1,Hỏi bài,"Mình ngại hỏi trong nhóm đông vì sợ bị chê",Cần không gian hỏi nhẹ nhàng
P4,SV năm 2,Ôn thi,"Mình tự làm flashcard rồi chụp ảnh gửi nhóm",Cần tạo bộ học chung trong nhóm
P5,SV năm 4,Họp nhóm,"Họp online xong thường quên ai nhận việc nào",Cần ghi việc ngay trong buổi họp
`,
    },
  ],
};

export const RESOURCES: Record<string, WorkspaceResources> = {
  frontend,
  math,
  appdev,
  ielts,
  dsa,
  backend,
  capstone,
  uiux,
};
