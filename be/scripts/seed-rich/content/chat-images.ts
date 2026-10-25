import type { ChatImageSpec } from "../media/types";

/**
 * Ảnh gửi kèm tin nhắn mới trong kênh TEXT (2 ảnh mỗi nhóm, 16 ảnh): sơ đồ, bảng trắng, wireframe dạng lưới thẻ.
 * Tên kênh khớp đúng `content/<khoá>.ts`; người gửi là thành viên nhóm và được phép nói ở kênh đó (đều là kênh công khai).
 */
export const CHAT_IMAGES: ChatImageSpec[] = [
  // ---- frontend ----
  {
    ws: "frontend",
    channel: "HTML & CSS",
    by: "thuytrang",
    text: "Mình vẽ wireframe landing page cho cả nhà bám theo nè 🌸📎",
    poster: {
      title: "Wireframe landing page",
      subtitle: "Mobile 375px → Desktop 1280px",
      theme: "ocean",
      sections: [
        {
          head: "Header",
          lines: ["Logo bên trái, menu bên phải", "Mobile: thu gọn thành nút menu", "Cao 64px, nền trắng", "Liên kết có :focus-visible"],
        },
        {
          head: "Hero",
          lines: ["Tiêu đề h1 cỡ lớn (clamp)", "Một câu mô tả ngắn", "Nút CTA tương phản ≥ 4.5:1", "Ảnh hero có thuộc tính alt"],
        },
        {
          head: "3 cột tính năng",
          lines: ["Mobile: 1 cột", "Tablet: 2 cột", "Desktop: 3 cột", "grid + gap: 24px"],
        },
        {
          head: "Footer",
          lines: ["Liên kết, mạng xã hội, bản quyền", "Luôn nằm đáy trang", "main { flex: 1 } đẩy footer xuống"],
        },
        {
          head: "Điểm ngắt",
          lines: ["375px: viết mobile-first", "@media (min-width: 768px)", "@media (min-width: 1280px)", "Kiểm tra cuộn ngang trên mobile"],
        },
      ],
    },
  },
  {
    ws: "frontend",
    channel: "React",
    by: "minhanh",
    text: "Mình vẽ lại luồng props đi xuống, sự kiện đi lên cho bài Todo React nè, ai đang rối thì xem thử nhé 📎",
    poster: {
      title: "Luồng dữ liệu trong React",
      subtitle: "Props đi xuống, sự kiện đi lên",
      theme: "violet",
      sections: [
        {
          head: "App (giữ state)",
          lines: ["const [tasks, setTasks] = useState([])", "State đặt ở component cha chung", "Truyền xuống: tasks, onToggle"],
        },
        {
          head: "TaskList",
          lines: ["Nhận tasks qua props", "tasks.map(t => <TaskItem key={t.id} />)", "key lấy từ id, không dùng index"],
        },
        {
          head: "TaskItem",
          lines: ["Nhận task và onToggle qua props", "Hiển thị tiêu đề và ô đánh dấu", "onChange gọi onToggle(task.id)"],
        },
        {
          head: "Sự kiện đi lên",
          lines: ["Người dùng bấm ô đánh dấu", "onToggle chạy trong App", "setTasks(ts => ts.map(...))"],
        },
        {
          head: "React render lại",
          lines: ["State mới nên App render lại", "Props mới chảy xuống TaskList", "Chỉ phần DOM đổi mới bị cập nhật"],
        },
        {
          head: "Lưu ý",
          lines: ["Props là chỉ đọc", "Không sửa state trực tiếp", "Dựa vào state cũ: dùng functional update"],
        },
      ],
    },
  },

  // ---- math ----
  {
    ws: "math",
    channel: "Giải tích 1",
    by: "trungkien",
    text: "Mình chụp lại các bước khảo sát hàm số trên bảng nè, ai cần thì lưu về nhé 📎",
    poster: {
      title: "Khảo sát hàm số y = f(x)",
      subtitle: "6 bước làm bài chuẩn",
      theme: "amber",
      sections: [
        {
          head: "1. Tập xác định",
          lines: ["Điều kiện của căn, mẫu số, ln", "Xét tính chẵn, lẻ, tuần hoàn"],
        },
        {
          head: "2. Chiều biến thiên",
          lines: ["Tính y'", "Giải y' = 0 hoặc y' không xác định", "Lập bảng xét dấu y'"],
        },
        {
          head: "3. Cực trị",
          lines: ["y' đổi dấu từ + sang −: cực đại", "y' đổi dấu từ − sang +: cực tiểu"],
        },
        {
          head: "4. Tiệm cận",
          lines: ["Đứng: x → a mà y → ∞", "Ngang: lim y khi x → ±∞", "Xiên: y = ax + b (a ≠ 0) nếu có"],
        },
        {
          head: "5. Lồi lõm",
          lines: ["Tính y''", "y'' đổi dấu: điểm uốn"],
        },
        {
          head: "6. Bảng biến thiên",
          lines: ["Tổng hợp cực trị, tiệm cận, điểm uốn", "Lấy thêm vài điểm rồi vẽ đồ thị"],
        },
      ],
    },
  },
  {
    ws: "math",
    channel: "Xác suất thống kê",
    by: "tanphat",
    text: "Cây xác suất bài xét nghiệm Bayes hồi nãy nè mọi người, vẽ ra là hết nhầm nhánh liền 📎",
    poster: {
      title: "Cây xác suất — bài xét nghiệm",
      subtitle: "Dương tính đúng 99%, dương tính giả 5%",
      theme: "forest",
      sections: [
        {
          head: "Nhánh bệnh (1%)",
          lines: ["P(bệnh) = 0,01", "P(+ | bệnh) = 0,99", "P(− | bệnh) = 0,01", "P(bệnh và +) = 0,0099"],
        },
        {
          head: "Nhánh không bệnh (99%)",
          lines: ["P(không bệnh) = 0,99", "P(+ | không bệnh) = 0,05", "P(− | không bệnh) = 0,95", "P(không bệnh và +) = 0,0495"],
        },
        {
          head: "Xác suất toàn phần",
          lines: ["P(+) = 0,0099 + 0,0495", "P(+) = 0,0594"],
        },
        {
          head: "Công thức Bayes",
          lines: ["P(bệnh | +) = P(bệnh và +) / P(+)", "= 0,0099 / 0,0594", "= 1/6 ≈ 16,7%"],
        },
        {
          head: "Nhận xét",
          lines: ["Tỉ lệ mắc bệnh thấp kéo kết quả xuống", "Dương tính chưa chắc đã bệnh", "Nên xét nghiệm lần hai để chắc hơn"],
        },
      ],
    },
  },

  // ---- appdev ----
  {
    ws: "appdev",
    channel: "Thiết kế UI",
    by: "thuytrang",
    text: "Wireframe v1 của 4 màn hình nè mọi người 🎨 góp ý giúp mình nhé 📎",
    poster: {
      title: "Wireframe Tiêu Gọn v1",
      subtitle: "4 màn hình của MVP",
      theme: "violet",
      sections: [
        {
          head: "Đăng nhập",
          lines: ["Logo và khẩu hiệu ngắn", "Ô email, ô mật khẩu có nút hiện/ẩn", "Nút Đăng nhập màu primary", "Link Quên mật khẩu, Đăng ký"],
        },
        {
          head: "Trang chủ",
          lines: ["Tổng chi hôm nay (số to)", "Danh sách khoản chi gần đây", "Nút + nổi ở góc phải dưới", "Tab dưới: Trang chủ, Thống kê, Cài đặt"],
        },
        {
          head: "Thêm khoản chi",
          lines: ["Nhập số tiền trước, bàn phím số", "Chọn danh mục bằng icon to", "Ghi chú ngắn, ngày mặc định hôm nay", "Mục tiêu: xong trong 3 chạm"],
        },
        {
          head: "Thống kê tuần",
          lines: ["Biểu đồ cột theo ngày trong tuần", "Danh sách top danh mục", "Tổng chi tuần này ở trên cùng", "Không nhồi thêm biểu đồ"],
        },
        {
          head: "Ghi chú chung",
          lines: ["Vùng chạm tối thiểu 48dp", "Khoảng cách theo lưới 8px", "Có bản sáng và bản tối", "Animation dưới 300ms"],
        },
      ],
    },
  },
  {
    ws: "appdev",
    channel: "Backend API",
    by: "quocbao",
    text: "Mình vẽ luồng tạo khoản chi với clientId nè, mọi người xem có chỗ nào sai không 📎",
    poster: {
      title: "Luồng tạo khoản chi không bị trùng",
      subtitle: "clientId + unique index (userId, clientId)",
      theme: "ocean",
      sections: [
        {
          head: "1. App tạo thao tác",
          lines: ["Sinh clientId (UUID)", "Lưu vào hàng đợi trên máy", "Hiện nhãn chưa đồng bộ"],
        },
        {
          head: "2. Gửi lên API",
          lines: ["POST /api/v1/transactions", "Kèm clientId và updatedAt", "Header Authorization: Bearer …"],
        },
        {
          head: "3. API ghi vào MongoDB",
          lines: ["Insert thẳng, không kiểm tra trước", "Unique index chặn bản ghi trùng", "Thành công: trả bản ghi mới"],
        },
        {
          head: "4. Gửi lại cùng clientId",
          lines: ["MongoDB báo duplicate key (11000)", "API tìm lại bản ghi cũ theo clientId", "Trả bản ghi cũ, không tạo thêm"],
        },
        {
          head: "5. App cập nhật",
          lines: ["Xoá thao tác khỏi hàng đợi", "Bỏ nhãn chưa đồng bộ", "Mạng lỗi thì thử lại sau"],
        },
      ],
    },
  },

  // ---- ielts ----
  {
    ws: "ielts",
    channel: "Writing Task 2",
    by: "anhthu",
    text: "Dàn ý đề Technology của mình nè, mọi người góp ý giúp mình trước khi viết nhé 📎",
    poster: {
      title: "Dàn ý Task 2: Technology",
      subtitle: "Discuss both views and give your opinion",
      theme: "forest",
      sections: [
        {
          head: "Đề bài",
          lines: ["Some say technology makes life easier;", "others say it makes life more complicated.", "Dạng đề: Discuss both views + opinion", "40 phút, tối thiểu 250 từ"],
        },
        {
          head: "Introduction",
          lines: ["Paraphrase đề bằng từ của mình", "Thesis: overall, technology makes life easier", "Với điều kiện dùng hợp lý"],
        },
        {
          head: "Body 1: easier",
          lines: ["Tiết kiệm thời gian: ngân hàng online", "Giữ liên lạc: gọi video với gia đình", "Mỗi ý có một ví dụ cụ thể"],
        },
        {
          head: "Body 2: complicated",
          lines: ["Quá tải: thông báo, mật khẩu, cập nhật", "Phụ thuộc, dễ sao nhãng khi học", "Ví dụ: lừa đảo qua tin nhắn"],
        },
        {
          head: "Conclusion",
          lines: ["Nhắc lại quan điểm bằng từ khác", "Không thêm ý mới"],
        },
        {
          head: "Từ cần dùng",
          lines: ["convenience, distraction", "depend on, be overwhelmed by", "keep in touch with"],
        },
      ],
    },
  },
  {
    ws: "ielts",
    channel: "Speaking Practice",
    by: "camtu",
    text: "Mình tóm tắt khung Part 2 lên bảng để tối nay luyện theo cặp nhé 📎",
    poster: {
      title: "Khung Part 2: A place you visited",
      subtitle: "1 phút ghi chú, nói 1–2 phút",
      theme: "sunset",
      sections: [
        {
          head: "Introduce",
          lines: ["I'd like to talk about …", "Nơi nào, đi khi nào"],
        },
        {
          head: "Details",
          lines: ["Nơi đó trông thế nào", "Đi với ai, đã làm gì", "Có điều gì đặc biệt"],
        },
        {
          head: "Feeling và Reason",
          lines: ["Vì sao đáng nhớ", "Bạn cảm thấy thế nào"],
        },
        {
          head: "Conclusion",
          lines: ["Có muốn quay lại không", "Kết bằng một câu gọn"],
        },
        {
          head: "Mẹo",
          lines: ["Ghi từ khoá, không viết cả câu", "Không dừng giữa chừng", "Câu giờ: Well, let me think …"],
        },
      ],
    },
  },

  // ---- dsa ----
  {
    ws: "dsa",
    channel: "Cây & Đồ thị",
    by: "minhkhoi",
    text: "Mình chụp lại bảng chạy tay Dijkstra nè, ai làm đề thi thì xem thử 📎",
    poster: {
      title: "Chạy tay Dijkstra từ đỉnh A",
      subtitle: "Đồ thị vô hướng 5 đỉnh",
      theme: "ocean",
      sections: [
        {
          head: "Đồ thị",
          lines: ["A–B: 4 ; A–C: 2 ; B–C: 1", "B–D: 5 ; C–D: 8", "C–E: 10 ; D–E: 2"],
        },
        {
          head: "Bước 1: chốt A (0)",
          lines: ["d[B] = 4, d[C] = 2", "d[D] = d[E] = ∞"],
        },
        {
          head: "Bước 2: chốt C (2)",
          lines: ["B: 2 + 1 = 3 < 4 nên d[B] = 3", "D: 2 + 8 = 10", "E: 2 + 10 = 12"],
        },
        {
          head: "Bước 3: chốt B (3)",
          lines: ["D: 3 + 5 = 8 < 10 nên d[D] = 8"],
        },
        {
          head: "Bước 4: chốt D (8)",
          lines: ["E: 8 + 2 = 10 < 12 nên d[E] = 10"],
        },
        {
          head: "Kết quả",
          lines: ["A = 0, C = 2, B = 3, D = 8, E = 10", "Đường tới E: A → C → B → D → E"],
        },
      ],
    },
  },
  {
    ws: "dsa",
    channel: "Quy hoạch động",
    by: "trungkien",
    text: "Bảng dp cái túi 0/1 mình viết tay nè, ai hay nhầm thứ tự duyệt thì xem thử nhé 📎",
    poster: {
      title: "Bảng dp cái túi 0/1",
      subtitle: "W = 7, cột w = 0, 1, 2, …, 7",
      theme: "sunset",
      sections: [
        {
          head: "Đề bài",
          lines: ["Sức chứa W = 7", "Món (khối lượng, giá trị):", "(1,1) (3,4) (4,5) (5,7)"],
        },
        {
          head: "i = 0 và i = 1",
          lines: ["i=0: 0 0 0 0 0 0 0 0", "i=1: 0 1 1 1 1 1 1 1", "Món (1,1) vừa túi từ w ≥ 1"],
        },
        {
          head: "i = 2, món (3,4)",
          lines: ["0 1 1 4 5 5 5 5", "dp[2][3] = max(1, dp[1][0] + 4) = 4"],
        },
        {
          head: "i = 3, món (4,5)",
          lines: ["0 1 1 4 5 6 6 9", "dp[3][7] = max(5, dp[2][3] + 5) = 9"],
        },
        {
          head: "i = 4, món (5,7)",
          lines: ["0 1 1 4 5 7 8 9", "dp[4][7] = max(9, dp[3][2] + 7) = 9"],
        },
        {
          head: "Công thức",
          lines: ["w < wt[i]: dp[i][w] = dp[i−1][w]", "Ngược lại: max(dp[i−1][w],", "  dp[i−1][w − wt[i]] + val[i])", "Đáp án: dp[4][7] = 9"],
        },
      ],
    },
  },

  // ---- backend ----
  {
    ws: "backend",
    channel: "MongoDB & Prisma",
    by: "haidang",
    text: "Hình minh hoạ N+1 hồi nãy nè mọi người 📎",
    poster: {
      title: "N+1 query: trước và sau",
      subtitle: "findMany bookings kèm thông tin sân",
      theme: "rose",
      sections: [
        {
          head: "Trước (N+1)",
          lines: ["findMany() lấy toàn bộ booking", "for mỗi booking: findUnique(court)", "100 booking = 101 lượt gọi DB", "Mỗi lượt tới Atlas mất vài chục ms"],
        },
        {
          head: "Sau (include)",
          lines: ["findMany({ include: { court: true } })", "Chỉ còn 2 lượt truy vấn", "Chỉ cần vài trường thì dùng select", "court: { select: { name: true } }"],
        },
        {
          head: "Cách phát hiện",
          lines: ["Bật log: ['query'] ở môi trường dev", "Log in ra hàng chục câu giống nhau", "Đo thời gian response của endpoint"],
        },
        {
          head: "Index liên quan",
          lines: ["@@index([courtId, startAt])", "Compound index: equality trước", "Range sau; kiểm tra bằng explain()"],
        },
        {
          head: "Ghi nhớ",
          lines: ["Đừng trả dư dữ liệu", "Mỗi index làm thao tác ghi chậm hơn"],
        },
      ],
    },
  },
  {
    ws: "backend",
    channel: "Docker & Deploy",
    by: "giahuy",
    text: "Pipeline CI/CD mình dựng xong rồi nè, PR nào đỏ là không merge nha 🚦📎",
    poster: {
      title: "Pipeline từ push đến production",
      subtitle: "GitHub Actions → Docker → Railway",
      theme: "ocean",
      sections: [
        {
          head: "1. Push và pull request",
          lines: ["Nhánh feature/* tách từ main", "Mở PR vào main", "Cần ít nhất 1 approve"],
        },
        {
          head: "2. CI (GitHub Actions)",
          lines: ["npm ci, cache npm", "Lint và typecheck", "Test API với MongoDB service", "npm audit"],
        },
        {
          head: "3. Build Docker",
          lines: ["Dockerfile multi-stage", ".dockerignore: .env, .git", "prisma generate ở stage build"],
        },
        {
          head: "4. Deploy Railway",
          lines: ["Biến môi trường đặt trên dashboard", "prisma db push TRƯỚC khi bật bản mới", "Kiểm tra /health trả 200"],
        },
        {
          head: "5. Rollback",
          lines: ["Giữ lại bản deploy cũ", "Lỗi thì quay về bản trước", "Báo trong kênh Chung"],
        },
      ],
    },
  },

  // ---- capstone ----
  {
    ws: "capstone",
    channel: "Thiết kế CSDL",
    by: "phuocloi",
    text: "Mình vẽ sơ đồ index đề xuất cho các collection, mọi người rà giúp mình với 📎",
    poster: {
      title: "Index đề xuất cho các collection",
      subtitle: "Rà thử trước khi chốt schema",
      theme: "slate",
      sections: [
        {
          head: "Sach",
          lines: ["Text index (tieuDe, tacGia)", "tieuDeKhongDau cho tìm không dấu", "Mục tiêu tìm kiếm dưới 2 giây"],
        },
        {
          head: "BanSao",
          lines: ["maVach: unique, kiểu String", "Giữ được số 0 đứng đầu", "sachId để đếm bản sao còn lại"],
        },
        {
          head: "DocGia",
          lines: ["maSV: unique", "Tìm nhanh theo mã sinh viên"],
        },
        {
          head: "PhieuMuon",
          lines: ["(docGiaId, trangThai)", "chiTiet.ngayHenTra (multikey)", "Phục vụ job quét sách quá hạn hằng đêm"],
        },
        {
          head: "Phat",
          lines: ["phieuMuonId để gom phạt theo phiếu", "(daThanhToan, ngayTao) để thống kê"],
        },
        {
          head: "Lưu ý",
          lines: ["Mỗi index làm thao tác ghi chậm hơn", "Kiểm tra bằng explain() trước khi thêm", "Chỉ đánh index cho truy vấn thực sự dùng"],
        },
      ],
    },
  },
  {
    ws: "capstone",
    channel: "Giao diện",
    by: "vietdung",
    text: "Wireframe màn Mượn/Trả cho thủ thư nè, mọi người góp ý giúp mình nhé 📎",
    poster: {
      title: "Màn hình Mượn / Trả (thủ thư)",
      subtitle: "Tối ưu thao tác nhanh tại quầy",
      theme: "ocean",
      sections: [
        {
          head: "Ô quét mã",
          lines: ["Con trỏ luôn nằm ở ô mã vạch", "Máy quét gõ mã rồi Enter", "Tự thêm bản sao vào danh sách"],
        },
        {
          head: "Thông tin độc giả",
          lines: ["Tìm bằng mã sinh viên", "Hiện số cuốn đang mượn / tối đa 5", "Cảnh báo nếu còn tiền phạt chưa thu"],
        },
        {
          head: "Danh sách sách",
          lines: ["Tên sách, mã vạch, hạn trả", "Quá hạn tô đỏ kèm số ngày trễ", "Nút Gia hạn và nút Trả"],
        },
        {
          head: "Tính phạt",
          lines: ["Hiện tiền phạt dự kiến", "Miễn hoặc giảm: bắt buộc nhập lý do", "Xác nhận trước khi lưu"],
        },
        {
          head: "Trạng thái giao diện",
          lines: ["Đang tải: skeleton loading", "Lỗi: hiện rõ mã lỗi", "Rỗng: gợi ý bước tiếp theo"],
        },
      ],
    },
  },

  // ---- uiux ----
  {
    ws: "uiux",
    channel: "Nguyên lý thiết kế",
    by: "thaonguyen",
    text: "Mình chụp bảng ví dụ trước–sau về hierarchy nè 📎 mọi người thử đoán nút nào được bấm trước nhé",
    poster: {
      title: "Hierarchy: trước và sau",
      subtitle: "Ví dụ màn hình đăng nhập",
      theme: "rose",
      sections: [
        {
          head: "Trước",
          lines: ["Hai nút cùng kích thước, cùng màu", "Không rõ nên bấm nút nào trước", "Tiêu đề và nhãn cùng cỡ chữ"],
        },
        {
          head: "Sau",
          lines: ["Đăng nhập: nút đặc màu primary", "Quên mật khẩu: dạng text, nhỏ hơn", "Tiêu đề to và đậm hơn nhãn"],
        },
        {
          head: "Công cụ tạo thứ bậc",
          lines: ["Kích thước và độ đậm", "Màu và độ tương phản", "Vị trí và khoảng trắng"],
        },
        {
          head: "Kiểm tra nhanh",
          lines: ["Nheo mắt: còn thấy rõ cái gì?", "Đó phải là điều quan trọng nhất", "Hỏi bạn bè sẽ bấm gì trước"],
        },
      ],
    },
  },
  {
    ws: "uiux",
    channel: "Bài tập: thiết kế app",
    by: "thaonguyen",
    text: "Wireframe Đăng nhập bản mới đã sửa theo góp ý hôm critique nè 📎",
    poster: {
      title: "Wireframe Đăng nhập — app Học nhóm",
      subtitle: "Bản 2, sửa theo góp ý critique",
      theme: "violet",
      sections: [
        {
          head: "Phần trên",
          lines: ["Logo app Học nhóm", "Nút Tiếp tục với Google ở trên cùng", "Dòng chữ: hoặc dùng email"],
        },
        {
          head: "Form",
          lines: ["Ô email", "Ô mật khẩu kèm nút hiện/ẩn", "Link Quên mật khẩu sát ô mật khẩu"],
        },
        {
          head: "Hành động",
          lines: ["Nút Đăng nhập (primary)", "Link Chưa có tài khoản? Đăng ký", "Nút hiện trạng thái đang tải"],
        },
        {
          head: "Báo lỗi",
          lines: ["Báo ngay dưới ô nhập", "Không chỉ dùng màu đỏ: thêm icon và chữ", "Sai tài khoản: thông báo chung"],
        },
        {
          head: "Ghi chú thiết kế",
          lines: ["Vùng chạm tối thiểu 48dp", "Khoảng cách theo lưới 8pt", "Frame 390 × 844"],
        },
      ],
    },
  },
];
