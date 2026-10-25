import type { WorkspaceSpec } from "../types";

export const spec: WorkspaceSpec = {
  key: "capstone",
  name: "Đồ án tốt nghiệp — Quản lý thư viện",
  description:
    "Nhóm làm đồ án tốt nghiệp “Hệ thống quản lý thư viện trường”: web React + Node/Express + MongoDB, với nghiệp vụ mượn–trả, phạt trễ hạn, tìm kiếm sách và thống kê.",
  cover: "slate",
  owner: "ngocdiep",
  admins: ["phuocloi", "ngoclan"],
  members: ["thu", "thuhien", "duyhung", "vietdung", "phuongthao", "mentortuan"],
  createdDaysAgo: 26,
  channels: [
    {
      name: "Chung",
      description: "Thông báo, timeline và lịch họp của nhóm đồ án",
      followers: "all",
      unreadForThu: 2,
      lines: [
        [
          "ngocdiep",
          "Timeline chốt của nhóm mình (pin lại nhé):\n① Thứ 6 tuần sau — gửi bản nháp báo cáo cho thầy hướng dẫn\n② 2 tuần nữa — nộp quyển báo cáo đóng bìa\n③ khoảng 3 tuần nữa — bảo vệ trước hội đồng.\nMọi người cập nhật bảng Tiến độ đồ án hằng ngày giúp mình ạ.",
          { pin: true, react: { "👍": ["phuocloi", "ngoclan", "thu", "thuhien", "duyhung"] } },
        ],
        [
          "phuocloi",
          "Ok Diệp. Mình sẽ chốt schema CSDL trong tuần này để bên backend và giao diện không phải sửa lại nhiều.",
          { reply: 0 },
        ],
        [
          "ngoclan",
          "Báo cáo chương 1–3 mình đang viết, chắc kịp bản nháp trước Thứ 6. Chương 2 cơ sở lý thuyết mình cần bạn nào hỗ trợ phần React/Node/MongoDB nhé.",
        ],
        [
          "thu",
          "Phần cơ sở lý thuyết để mình viết ạ, {@ngoclan} gửi mình dàn ý chương 2 nhé. Mình sẽ nộp bản nháp trước Thứ 4.",
        ],
        ["ngoclan", "Dàn ý mình gửi ở kênh Báo cáo & Slide rồi nha {@thu} 👍", { reply: 3 }],
        [
          "mentortuan",
          "Các em nhớ: lúc bảo vệ, hội đồng rất hay hỏi “vì sao chọn MongoDB cho hệ thống thư viện mà không chọn SQL?”. Cả nhóm nên thống nhất câu trả lời sớm, đừng để mỗi người nói một kiểu.",
          { react: { "👍": ["ngocdiep", "phuocloi", "ngoclan"] } },
        ],
        [
          "phuocloi",
          "Dạ, mình sẽ viết thành mục “Lý do chọn công nghệ” trong báo cáo, gồm cả ưu/nhược điểm và cách xử lý ràng buộc quan hệ.",
        ],
        [
          "ngocdiep",
          "Họp nhóm tuần này (tổng duyệt báo cáo + xem demo) mọi người chọn khung giờ nào?",
          {
            poll: {
              options: ["Tối Thứ 3 (20h)", "Tối Thứ 5 (20h)", "Sáng Chủ nhật (9h)"],
              votes: [
                ["phuongthao", "duyhung"],
                ["thu", "phuocloi", "vietdung", "ngoclan", "thuhien", "ngocdiep"],
                ["mentortuan"],
              ],
              closesInDays: 2,
            },
          },
        ],
        [
          "ngocdiep",
          "Chốt tối Thứ 5 20h nha cả nhóm, họp ở Phòng họp đồ án 📌 Ai bận nhắn riêng mình sớm giúp mình.",
          { reply: 7 },
        ],
        ["duyhung", "Mình nhớ rồi. Tối Thứ 5 mình demo luôn API mượn/trả cho mọi người xem nhé."],
        [
          "phuongthao",
          "Mình sẽ chuẩn bị bộ test case mượn–trả–phạt trước buổi đó. Có vài trường hợp biên mình muốn kiểm tra: trả đúng hạn, trả trễ 1 ngày, mất sách 😅",
          { react: { "👍": ["ngocdiep", "duyhung"] } },
        ],
        [
          "vietdung",
          "Giao diện tìm kiếm mình đã dựng xong khung, tối mai mình đẩy lên nhánh để {@thu} ghép phần bộ lọc.",
        ],
        ["ngocdiep", "Cảm ơn mọi người ❤️ Nhớ nhé, deadline không chờ ai 😄", { react: { "😄": ["thu", "phuongthao"] } }],
        [
          "thuhien",
          "Mình đã gom tất cả tài liệu vào thư mục chung, kể cả mẫu slide bảo vệ. Cứ vào kênh Báo cáo & Slide là thấy ạ.",
        ],
      ],
    },
    {
      name: "Phân tích yêu cầu",
      description: "Yêu cầu chức năng, phi chức năng và quy tắc nghiệp vụ",
      lines: [
        [
          "ngocdiep",
          "Mình tổng hợp lại yêu cầu chức năng sau buổi gặp thủ thư của trường:\n1) Quản lý đầu sách và bản sao\n2) Quản lý độc giả (sinh viên, giảng viên)\n3) Mượn – trả – gia hạn\n4) Tính phạt trễ hạn / làm hỏng / mất sách\n5) Tìm kiếm sách\n6) Thống kê báo cáo.\nAi thấy thiếu cứ bổ sung nhé.",
          { pin: true },
        ],
        [
          "ngoclan",
          "Mình bổ sung yêu cầu phi chức năng: thời gian phản hồi tìm kiếm dưới 2 giây với khoảng 50.000 đầu sách, và phải có phân quyền (độc giả, thủ thư, quản trị).",
        ],
        [
          "mentortuan",
          "Các em nên định nghĩa rõ quy tắc nghiệp vụ trước khi code: mượn tối đa mấy cuốn, mượn bao nhiêu ngày, gia hạn mấy lần, mức phạt tính thế nào. Đây là phần hội đồng hay hỏi nhất.",
        ],
        [
          "ngocdiep",
          "Dạ anh, bọn em đã hỏi thủ thư và chốt như sau: tối đa 5 cuốn, mượn 14 ngày, gia hạn 1 lần thêm 7 ngày, phạt 2.000đ/ngày/cuốn trễ hạn.",
          {
            reply: 2,
            thread: [
              ["phuocloi", "Phạt trễ có trần không? Ví dụ trễ 3 tháng thì tiền phạt vượt cả giá sách thì sao?"],
              [
                "ngocdiep",
                "Mình đề xuất trần phạt = giá bìa của cuốn sách. Vượt trần thì thủ thư xử lý thủ công.",
              ],
              ["ngoclan", "Đồng ý, mình ghi vào báo cáo mục quy tắc nghiệp vụ nhé."],
              [
                "mentortuan",
                "Hợp lý. Nhớ cho phép thủ thư miễn/giảm phạt có ghi lý do, để có dấu vết kiểm toán (audit).",
              ],
            ],
          },
        ],
        [
          "thu",
          "Mình có thắc mắc: độc giả có được tự gia hạn trên web không, hay phải đến quầy thủ thư? Việc này ảnh hưởng đến phân quyền ạ.",
        ],
        [
          "ngocdiep",
          "Cho tự gia hạn trên web nếu sách đó chưa có người đặt trước. Thêm yêu cầu “đặt trước” (reservation) nhưng để mức ưu tiên thấp.",
          { reply: 4 },
        ],
        [
          "duyhung",
          "Đặt trước thì cần thêm collection DatTruoc và hàng đợi. Mình đề xuất để sau cùng nếu còn thời gian.",
        ],
        [
          "phuongthao",
          "Mình đã viết xong checklist kiểm thử theo từng yêu cầu ở trên, đánh số FR-01…FR-12 để truy vết nha 📋",
          { react: { "👍": ["ngocdiep", "ngoclan"] } },
        ],
        [
          "vietdung",
          "Giao diện cho thủ thư nên hỗ trợ máy quét mã vạch (máy quét hoạt động như gõ phím + Enter) để trả sách nhanh. Thực tế tại quầy rất tiện.",
        ],
        ["ngoclan", "Hay đó Dũng. Mình ghi vào báo cáo mục “Giải pháp thao tác nhanh tại quầy” luôn.", { reply: 8 }],
        [
          "phuocloi",
          "Mình tổng hợp quyền theo vai trò: Độc giả (tìm sách, xem phiếu mượn của mình, gia hạn); Thủ thư (quản lý sách, bản sao, mượn/trả, miễn giảm phạt); Quản trị (quản lý tài khoản thủ thư, xem thống kê toàn bộ).",
          { react: { "✅": ["ngocdiep", "ngoclan", "mentortuan"] } },
        ],
        ["ngoclan", "Mình đưa bảng quyền này vào chương 3 luôn nha 👍"],
      ],
    },
    {
      name: "Thiết kế CSDL",
      description: "ERD, schema MongoDB, index và ràng buộc dữ liệu",
      lines: [
        [
          "phuocloi",
          "Mình đăng ERD v2 rồi nhé. Thực thể chính: Sach (đầu sách), BanSao (từng cuốn vật lý), DocGia, PhieuMuon, ChiTietMuon, Phat, NhanVien (thủ thư), TheLoai, TacGia.\nQuan hệ: Sach 1–N BanSao; DocGia 1–N PhieuMuon; PhieuMuon 1–N ChiTietMuon; ChiTietMuon N–1 BanSao.",
          { pin: true, react: { "👍": ["ngocdiep", "ngoclan", "duyhung"] } },
        ],
        [
          "mentortuan",
          "Em tách Sach và BanSao là đúng: một đầu sách có nhiều bản sao, trạng thái mượn gắn với bản sao chứ không phải đầu sách. Còn Sach – TacGia là quan hệ N–N, em xử lý thế nào?",
          { reply: 0 },
        ],
        [
          "phuocloi",
          "Dạ, trong MongoDB mình để mảng tacGiaIds trong Sach (tham chiếu), vì số tác giả mỗi sách ít. Thể loại cũng lưu mảng id.",
          { reply: 1 },
        ],
        [
          "duyhung",
          "Bên backend mình hỏi: ChiTietMuon nên embed vào PhieuMuon hay tách collection riêng? Phiếu mượn tối đa 5 cuốn nên embed có vẻ gọn.",
          {
            thread: [
              [
                "phuocloi",
                "Mình nghiêng về embed: luôn đọc cả phiếu cùng chi tiết, tối đa 5 phần tử nên không lo document quá lớn (giới hạn 16MB).",
              ],
              [
                "mentortuan",
                "Đúng. Tiêu chí: dữ liệu luôn được đọc cùng nhau và số phần tử bị chặn trên thì embed. Nhưng BanSao vẫn là collection riêng vì cần cập nhật trạng thái độc lập.",
              ],
              [
                "duyhung",
                "Hiểu. Vậy PhieuMuon.chiTiet = [{ banSaoId, ngayHenTra, ngayTra, trangThai }]. Mình để thêm snapshot tên sách để hiển thị lịch sử cho nhanh.",
              ],
              ["phuocloi", "Snapshot được, nhưng nhớ chỉ dùng để hiển thị, nguồn sự thật vẫn là Sach."],
            ],
          },
        ],
        ["thu", "Mình thắc mắc: Phat có nên là collection riêng không, hay nằm trong PhieuMuon cho tiện ạ?"],
        [
          "phuocloi",
          "Mình tách Phat riêng (phieuMuonId, lyDo: TRE_HAN | HU_HONG | MAT_SACH, soTien, daThanhToan) vì cần thống kê tổng tiền phạt theo kỳ và một phiếu có thể phát sinh nhiều khoản phạt.",
          { reply: 4 },
        ],
        ["ngoclan", "Cho mình xin bản ERD dạng ảnh có chú thích để chèn vào chương 3 nhé Lợi 🙏"],
        ["phuocloi", "Mình xuất file PNG và PDF lên thư mục chung tối nay.", { reply: 6 }],
        [
          "ngocdiep",
          "Chốt schema là việc ưu tiên số 1 tuần này. Còn gì chưa chắc thì hỏi trong kênh này luôn, đừng để dồn.",
          { react: { "💯": ["phuocloi", "duyhung"] } },
        ],
        [
          "duyhung",
          "Index đề xuất: Sach text index (tieuDe, tacGia) cho tìm kiếm, BanSao.maVach unique, DocGia.maSV unique, PhieuMuon (docGiaId, trangThai). Mọi người xem có thiếu không?",
        ],
        [
          "mentortuan",
          "Thêm index cho PhieuMuon.chiTiet.ngayHenTra (multikey) nếu sau này cần job quét sách quá hạn hằng đêm.",
        ],
        [
          "phuongthao",
          "Mình thấy mã vạch của BanSao nên là chuỗi, không phải số, vì có thể có số 0 đứng đầu 🐞 Lần trước mình test bị mất số 0.",
          { react: { "👀": ["phuocloi", "duyhung"] } },
        ],
        ["phuocloi", "Đúng rồi, maVach kiểu string, mình sửa trong schema luôn.", { reply: 11, edited: true }],
        ["duyhung", "Mình dùng Mongoose schema theo ERD, push lên nhánh feat/models để mọi người xem nhé."],
      ],
    },
    {
      name: "Backend",
      description: "API mượn/trả, phạt trễ hạn, phân quyền và tài liệu API",
      unreadForThu: 3,
      lines: [
        [
          "duyhung",
          "API mượn/trả đã chạy được bản đầu: POST /api/loans (mượn), POST /api/loans/:id/return (trả), POST /api/loans/:id/renew (gia hạn). Mọi người pull nhánh feat/loans về thử, Postman collection mình để trong thư mục docs/ nhé.",
          { pin: true },
        ],
        [
          "mentortuan",
          "Khi trả sách em có dùng transaction không? Trả sách đổi trạng thái BanSao, cập nhật phiếu và có thể tạo Phat — 3 thao tác phải cùng thành công hoặc cùng huỷ.",
          { reply: 0 },
        ],
        [
          "duyhung",
          "Dạ em có dùng session.withTransaction() của Mongoose. Transaction cần replica set nên em dùng MongoDB Atlas, còn local chạy docker replica set 1 node.",
          { reply: 1 },
        ],
        [
          "phuocloi",
          "Mình đề xuất công thức phạt: soNgayTre = max(0, ngàyTrả − ngàyHẹnTrả) tính theo ngày lịch (bỏ phần giờ, múi giờ Asia/Ho_Chi_Minh); tiền = soNgayTre × 2.000đ, tối đa bằng giá bìa mỗi cuốn.",
          {
            thread: [
              [
                "duyhung",
                "Mình lưu ngayHenTra dạng Date UTC, vậy khi so sánh có phải đổi sang giờ VN không? Trả lúc 23h VN là 16h UTC cùng ngày nên chắc không lệch?",
              ],
              [
                "mentortuan",
                "Vẫn lệch được: 00:30 sáng VN ngày 5 là 17:30 UTC ngày 4. Em nên quy về ngày VN trước khi trừ, ví dụ cộng 7 giờ rồi lấy phần ngày.",
              ],
              [
                "duyhung",
                "Em hiểu rồi, em sẽ viết hàm toNgayVN(date) cộng 7 giờ rồi cắt giờ, và có unit test cho case giao ngày.",
              ],
              ["phuongthao", "Mình sẽ thêm case trả lúc 23:59 và 00:01 vào bộ test nha ⏰"],
            ],
          },
        ],
        [
          "ngocdiep",
          "Hàm phạt xong thì báo mình để mình ghi vào báo cáo chương 4 nhé. Deadline phần backend: hết Thứ 6 tuần này.",
          { react: { "⏳": ["duyhung", "phuocloi"] } },
        ],
        ["duyhung", "Mình sẽ kịp ạ, chỉ còn phần gia hạn và phân quyền route.", { reply: 4 }],
        [
          "thu",
          "Mình đang nối trang tìm kiếm với GET /api/books?q=...&page=...&limit=..., API này khi nào có hả {@duyhung}?",
        ],
        [
          "duyhung",
          "Có rồi nhé {@thu}, dùng text index nên tìm theo tiêu đề + tác giả; trả về { items, total, page, limit }. Tìm tiếng Việt không dấu mình xử lý bằng trường tieuDeKhongDau (vì chữ đ không tự quy về d).",
          { reply: 6 },
        ],
        ["vietdung", "Nhớ trả về lỗi đồng nhất { error: { code, message } } để giao diện hiển thị dễ nhé."],
        [
          "duyhung",
          "Ok Dũng. Mình đã bọc error middleware, mã lỗi như BOOK_NOT_AVAILABLE, LOAN_LIMIT_EXCEEDED.",
          { reply: 8 },
        ],
        ["phuocloi", "Các mã lỗi này mình ghi vào phụ lục báo cáo luôn nha."],
        [
          "mentortuan",
          "Gợi ý: viết OpenAPI (Swagger) cho API, vừa làm tài liệu vừa chèn được vào báo cáo. swagger-ui-express cài rất nhanh.",
          { react: { "👍": ["duyhung", "ngoclan", "ngocdiep"] } },
        ],
        ["duyhung", "Dạ em sẽ thêm Swagger trong hôm nay."],
      ],
    },
    {
      name: "Giao diện",
      description: "Giao diện React cho độc giả và thủ thư",
      unreadForThu: 2,
      lines: [
        [
          "vietdung",
          "Khung giao diện đã dựng xong: React + Vite, React Router, thư viện component là MUI để làm nhanh. Các trang: Đăng nhập, Tìm kiếm sách, Chi tiết sách, Phiếu mượn của tôi (độc giả); Quản lý sách, Mượn/Trả, Thống kê (thủ thư).",
        ],
        [
          "thu",
          "Mình nhận trang Tìm kiếm với bộ lọc (thể loại, tác giả, còn sách hay không). Gọi API qua axios + React Query nhé {@vietdung}?",
          { reply: 0 },
        ],
        [
          "vietdung",
          "Đúng rồi, mình để sẵn hook useBooks. Thu chỉ cần truyền params. Nhớ debounce 300ms ở ô tìm kiếm để không gọi API mỗi lần gõ.",
          { reply: 1 },
        ],
        [
          "thuhien",
          "Bạn nào cần ảnh bìa sách mẫu hay icon thì báo mình, mình đã gom bộ ảnh minh hoạ rồi (ảnh tự tạo, không vướng bản quyền) 📚",
          { react: { "😍": ["thu", "ngoclan"] } },
        ],
        [
          "ngocdiep",
          "Giao diện cho thủ thư ưu tiên đủ dùng chứ chưa cần đẹp lắm nhé. Điểm chính là luồng Mượn/Trả chạy ổn khi demo.",
        ],
        [
          "phuongthao",
          "Mình test trang Tìm kiếm: gõ ký tự đặc biệt như “(” hay “\\” thì API trả lỗi 500 🐞 {@duyhung} {@thu} xem giúp mình.",
          {
            thread: [
              [
                "duyhung",
                "Mình thấy rồi: mình đưa chuỗi người dùng nhập thẳng vào $regex mà chưa escape. Sửa ngay trong hôm nay.",
              ],
              [
                "mentortuan",
                "Ưu tiên $text khi có thể; nếu phải dùng regex thì escape ký tự đặc biệt. Đây không chỉ là lỗi 500 mà còn liên quan bảo mật (NoSQL injection, ReDoS) nên ghi vào mục “Bảo mật” của báo cáo nhé.",
              ],
              ["phuongthao", "Sau khi sửa mình sẽ thêm test với chuỗi ( [ \\ * + ? vào bộ test."],
              ["thu", "Phía giao diện mình cũng trim và giới hạn độ dài 100 ký tự cho ô tìm kiếm."],
            ],
          },
        ],
        [
          "thu",
          "Bộ lọc thể loại xong rồi. Mình đẩy lên nhánh feat/search để mọi người xem thử nha 🙌",
          { react: { "🙌": ["vietdung", "ngocdiep", "phuongthao"] } },
        ],
        [
          "ngoclan",
          "Ảnh chụp các màn hình mình cần cho chương 4 gồm: Đăng nhập, Tìm kiếm, Mượn sách, Trả sách + tính phạt, Thống kê. Khi nào xong gửi mình ảnh độ phân giải cao nhé.",
        ],
        [
          "vietdung",
          "Ok Lan, mình sẽ chụp ở chế độ 1440px rộng, dữ liệu mẫu bằng tiếng Việt cho đẹp.",
          { reply: 7 },
        ],
        [
          "thuhien",
          "Mình dựng dữ liệu mẫu 200 đầu sách bằng script seed rồi, ai cần thì chạy lệnh seed trong thư mục backend nhé.",
        ],
        [
          "mentortuan",
          "Giao diện thủ thư: đừng quên trạng thái loading/lỗi/rỗng ở mỗi danh sách, hội đồng bấm vào là thấy ngay.",
        ],
        ["vietdung", "Dạ em có thêm skeleton loading và trang rỗng rồi ạ.", { reply: 10 }],
      ],
    },
    {
      name: "Báo cáo & Slide",
      description: "Báo cáo chương 1–5, slide bảo vệ, tài liệu tham khảo",
      lines: [
        [
          "ngoclan",
          "Dàn ý báo cáo:\nChương 1 — Giới thiệu (lý do chọn đề tài, mục tiêu, phạm vi)\nChương 2 — Cơ sở lý thuyết (React, Node/Express, MongoDB, REST, JWT)\nChương 3 — Phân tích & thiết kế (yêu cầu, ERD, kiến trúc)\nChương 4 — Triển khai & kiểm thử\nChương 5 — Kết luận & hướng phát triển.",
          { pin: true, react: { "👍": ["ngocdiep", "thu", "phuocloi"] } },
        ],
        [
          "ngocdiep",
          "Chương 1 mình duyệt rồi nhé Lan, chỉ cần thêm 1 đoạn về thực trạng quản lý thư viện thủ công ở trường (lấy từ buổi gặp thủ thư).",
          { reply: 0 },
        ],
        ["ngoclan", "Ok Diệp, mình bổ sung hôm nay luôn.", { reply: 1 }],
        [
          "thu",
          "Mình viết xong khoảng 60% chương 2 rồi ạ. Đang viết phần MongoDB (document model, index, transaction) và JWT. Có gì sai nhờ {@phuocloi} {@mentortuan} sửa giúp mình nhé.",
          {
            thread: [
              [
                "phuocloi",
                "Phần MongoDB bạn ghi đúng nhé: transaction đa document có từ phiên bản 4.0 (replica set) và 4.2 (sharded cluster).",
              ],
              [
                "thu",
                "Cảm ơn Lợi ạ, mình ghi lại đúng như vậy. Còn index thì mình nêu single, compound, text, multikey được không?",
              ],
              ["phuocloi", "Được, thêm unique index nữa vì mình dùng cho maVach và maSV."],
              [
                "mentortuan",
                "Ngoài ra em có thể thêm 1 bảng so sánh ngắn embed vs reference, rất sát với đề tài.",
              ],
            ],
          },
        ],
        [
          "mentortuan",
          "Chương lý thuyết đừng dài dòng như sách giáo khoa, em chỉ nên viết những gì thực sự dùng trong đề tài, kèm nguồn tài liệu chính thức.",
          { reply: 3 },
        ],
        [
          "thuhien",
          "Slide mình chia thành: Giới thiệu (2 slide), Phân tích & thiết kế (4), Demo (3), Kiểm thử & kết quả (2), Kết luận (1). Tổng khoảng 12 slide cho 15 phút nói ạ.",
        ],
        [
          "ngocdiep",
          "Thời lượng bảo vệ dự kiến 15 phút trình bày + 10 phút hỏi đáp. Tụi mình tập thử ít nhất 2 lần có bấm giờ nhé.",
          { reply: 5 },
        ],
        [
          "vietdung",
          "Từ kinh nghiệm xem các nhóm trước: hội đồng hay ngắt ở phần demo, nên luôn có video demo dự phòng phòng khi mạng hay máy chiếu trục trặc.",
        ],
        ["thu", "Mình sẽ quay video demo 2–3 phút làm phương án dự phòng ạ.", { reply: 7 }],
        [
          "thuhien",
          "Mình đã đưa mẫu slide lên thư mục chung. Màu chủ đạo xanh navy + vàng nhạt cho hợp tông thư viện 📘✨",
          { react: { "😍": ["ngoclan", "ngocdiep", "thu"] } },
        ],
        [
          "ngoclan",
          "Chương 3 đang chờ ERD bản cuối từ {@phuocloi}. Chương 4 sẽ viết sau khi backend + giao diện chốt. Bản nháp gửi thầy hướng dẫn: Thứ 6 tuần sau.",
          { pin: true },
        ],
        [
          "thuhien",
          "Mình đã chuyển dàn ý chương 4 thành checklist ảnh chụp màn hình cần có, ai làm xong màn nào thì tick giúp mình nhé.",
          { edited: true },
        ],
        [
          "ngocdiep",
          "Mình đã đọc chương 1–2 bản mới, cảm ơn Thu và Lan, chỉ chỉnh nhẹ vài chỗ văn phong thôi ạ.",
        ],
      ],
    },
    {
      name: "Ban chủ nhiệm đồ án",
      description: "Kênh riêng của ban chủ nhiệm: rủi ro, phân công và chuẩn bị bảo vệ",
      private: ["phuocloi", "ngoclan", "mentortuan"],
      lines: [
        [
          "ngocdiep",
          "Kênh riêng cho ban chủ nhiệm đồ án: mình, Lợi, Lan và anh Tuấn. Mình muốn rà rủi ro trước khi bảo vệ, không muốn đăng lên kênh chung cho mọi người thêm lo.",
        ],
        [
          "phuocloi",
          "Rủi ro lớn nhất của mình: schema vừa chốt mà backend vẫn đang sửa model, dễ lệch. Mình sẽ đóng băng schema từ cuối tuần.",
        ],
        [
          "mentortuan",
          "Đóng băng là đúng. Rủi ro thứ hai anh thấy là demo trực tiếp: dữ liệu mẫu phải sạch, có kịch bản demo ghi sẵn từng bước, và có video dự phòng.",
          { reply: 1 },
        ],
        [
          "ngoclan",
          "Báo cáo: chương 1–3 sẵn sàng bản nháp. Chương 4 còn phụ thuộc vào tiến độ code. Mình lo nhất là có bạn nộp trễ phần được giao.",
        ],
        [
          "ngocdiep",
          "Mình sẽ nhắc lại deadline cho từng người: Thu — chương 2 và trang tìm kiếm; Hưng — API mượn/trả; Dũng — giao diện thủ thư; Thảo — test; Hiền — slide.",
          { reply: 3 },
        ],
        [
          "mentortuan",
          "Anh thấy bạn Thu và bạn Hưng đang gánh khá nhiều. Nếu cần chia bớt, Dũng đã quen React có thể nhận thêm phần tìm kiếm.",
        ],
        [
          "ngocdiep",
          "Dạ, tối nay em hỏi riêng Thu xem bạn có cần hỗ trợ không, bạn ấy hay ngại nhờ.",
          { reply: 5 },
        ],
        [
          "phuocloi",
          "Câu hỏi phản biện khả dĩ: vì sao dùng MongoDB, xử lý đồng thời khi 2 người cùng mượn 1 bản sao, bảo mật token. Mình soạn câu trả lời mẫu cho 3 câu này.",
        ],
        [
          "mentortuan",
          "Tốt. Với tình huống 2 người cùng mượn một bản sao: dùng cập nhật có điều kiện (findOneAndUpdate với điều kiện trangThai = SAN_SANG) để thao tác nguyên tử. Nhớ nhắc nhóm ghi điều này vào báo cáo.",
          { react: { "👍": ["phuocloi", "ngocdiep"] } },
        ],
        ["ngoclan", "Mình thêm vào mục “Xử lý đồng thời” ở chương 4 nhé.", { reply: 8 }],
        ["ngocdiep", "Chốt. Họp ban chủ nhiệm 15 phút sau buổi họp nhóm Thứ 5 để rà lại."],
      ],
    },
    {
      name: "Phòng họp đồ án",
      description: "Phòng họp thoại của nhóm đồ án",
      type: "VOICE",
      followers: "all",
    },
  ],
  boards: [
    {
      name: "Tiến độ đồ án",
      description: "Theo dõi báo cáo, backend, giao diện và chuẩn bị bảo vệ",
      columns: [
        { title: "Cần làm", kind: "TODO" },
        { title: "Đang làm", kind: "IN_PROGRESS" },
        { title: "Chờ review", kind: "REVIEW" },
        { title: "Hoàn thành", kind: "DONE" },
      ],
      labels: [
        ["Báo cáo", "blue"],
        ["CSDL", "teal"],
        ["Backend", "green"],
        ["Giao diện", "pink"],
        ["Kiểm thử", "orange"],
        ["Bảo vệ", "purple"],
        ["Gấp", "red"],
      ],
      tasks: [
        // Cần làm
        {
          title: "Dashboard thống kê: top sách mượn, độc giả trễ hạn, tiền phạt theo tháng",
          col: 0,
          desc: "Aggregation phía backend và biểu đồ cột/đường ở giao diện thủ thư.",
          labels: ["Giao diện", "Backend"],
          assignees: ["vietdung", "duyhung"],
          points: 5,
          dueInDays: 10,
        },
        {
          title: "Viết test: unit (tính phạt) + API (mượn/trả) + e2e luồng thủ thư",
          col: 0,
          desc: "Bám theo checklist FR-01…FR-12 của Thảo; ưu tiên các case biên về ngày và múi giờ.",
          labels: ["Kiểm thử"],
          assignees: ["phuongthao", "thu"],
          points: 8,
          dueInDays: 12,
          checklist: [
            ["Unit test hàm tính phạt (đúng hạn, trễ 1 ngày, giao ngày)", false],
            ["Test API mượn / trả / gia hạn", false],
            ["Test phân quyền độc giả – thủ thư", false],
            ["E2E luồng thủ thư: mượn → trả → tính phạt", false],
          ],
          comments: [["phuongthao", "Mình sẽ chia việc cho Thu phần test API mượn/trả nhé."]],
        },
        {
          title: "Slide bảo vệ (~12 slide) + tập thuyết trình có bấm giờ",
          col: 0,
          desc: "Tông xanh navy + vàng nhạt; ít chữ, nhiều ảnh chụp hệ thống thật.",
          labels: ["Bảo vệ"],
          assignees: ["thuhien", "ngocdiep"],
          points: 5,
          dueInDays: 14,
          comments: [["mentortuan", "Nhớ có một slide về hạn chế và hướng phát triển nhé."]],
        },
        {
          title: "Quay video demo 3 phút làm phương án dự phòng",
          col: 0,
          desc: "Quay luồng mượn → trả → phạt → thống kê, có thuyết minh ngắn.",
          labels: ["Bảo vệ"],
          assignees: ["thu"],
          points: 3,
          dueInDays: 16,
        },
        {
          title: "Soạn bộ câu hỏi phản biện & câu trả lời mẫu",
          col: 0,
          desc: "Vì sao MongoDB, xử lý đồng thời, bảo mật token, hạn chế của hệ thống...",
          labels: ["Bảo vệ"],
          assignees: ["phuocloi", "ngoclan"],
          points: 3,
          dueInDays: 15,
        },
        {
          title: "In và đóng quyển báo cáo (4 bản)",
          col: 0,
          desc: "Liên hệ quán in trước 2 ngày; kiểm tra lề, mục lục, số trang trước khi in.",
          labels: ["Báo cáo"],
          assignees: ["ngocdiep"],
          points: 2,
          dueInDays: 13,
        },
        // Đang làm
        {
          title: "Chương 2: Cơ sở lý thuyết (React, Node/Express, MongoDB, REST, JWT)",
          col: 1,
          desc: "Chỉ viết những gì thực sự dùng trong đề tài, có nguồn tài liệu chính thức.",
          labels: ["Báo cáo"],
          assignees: ["thu"],
          points: 5,
          startInDays: -5,
          dueInDays: 2,
          checklist: [
            ["Phần React + React Router", true],
            ["Phần Node.js / Express / REST", true],
            ["Phần MongoDB (document model, index, transaction)", false],
            ["Phần JWT & phân quyền", false],
            ["Bảng so sánh embed vs reference", false],
          ],
          comments: [["ngoclan", "Mình đã đọc phần đầu, ổn rồi Thu. Gửi mình nốt phần MongoDB nhé."]],
        },
        {
          title: "Tính phạt trễ hạn + miễn/giảm phạt có ghi lý do",
          col: 1,
          desc: "Phạt 2.000đ/ngày/cuốn theo ngày lịch (múi giờ VN), tối đa bằng giá bìa.",
          labels: ["Backend", "Gấp"],
          assignees: ["duyhung"],
          points: 5,
          startInDays: -3,
          dueInDays: 2,
          checklist: [
            ["Hàm toNgayVN và tính số ngày trễ", true],
            ["Áp dụng trần phạt theo giá bìa", false],
            ["Collection Phat + liên kết với phiếu mượn", false],
            ["API miễn/giảm phạt có lý do (audit)", false],
          ],
          comments: [["mentortuan", "Nhớ test các case giao ngày (23:59 và 00:01)."]],
        },
        {
          title: "Phân quyền độc giả / thủ thư / quản trị (middleware + route guard)",
          col: 1,
          desc: "Backend kiểm tra vai trò từ JWT; giao diện ẩn/hiện menu theo vai trò.",
          labels: ["Backend", "Giao diện"],
          assignees: ["duyhung", "vietdung"],
          points: 5,
          startInDays: -2,
          dueInDays: 4,
          comments: [["phuocloi", "Bảng quyền chi tiết mình đã ghi trong kênh Phân tích yêu cầu."]],
        },
        {
          title: "Màn hình thủ thư: Mượn/Trả bằng mã vạch",
          col: 1,
          desc: "Hỗ trợ máy quét mã vạch (gõ phím + Enter), hiển thị tiền phạt ngay khi trả trễ.",
          labels: ["Giao diện"],
          assignees: ["vietdung"],
          points: 5,
          startInDays: -2,
          dueInDays: 6,
        },
        // Chờ review
        {
          title: "Chương 3: Phân tích & thiết kế hệ thống",
          col: 2,
          desc: "Yêu cầu, quy tắc nghiệp vụ, bảng quyền, ERD, kiến trúc tổng thể.",
          labels: ["Báo cáo", "Gấp"],
          assignees: ["ngoclan"],
          points: 8,
          startInDays: -8,
          dueInDays: -1,
          checklist: [
            ["Mục yêu cầu chức năng / phi chức năng", true],
            ["Quy tắc nghiệp vụ (mượn, gia hạn, phạt)", true],
            ["ERD bản cuối từ Lợi", false],
            ["Sơ đồ kiến trúc 3 lớp", false],
          ],
          comments: [["ngocdiep", "Chờ ERD bản cuối là chốt được, Lan đừng lo nhé."]],
        },
        {
          title: "API mượn / trả / gia hạn sách (có transaction)",
          col: 2,
          desc: "Trả sách cập nhật BanSao, PhieuMuon và tạo Phat trong cùng một transaction.",
          labels: ["Backend"],
          assignees: ["duyhung"],
          points: 8,
          startInDays: -7,
          dueInDays: 0,
          checklist: [
            ["POST /api/loans (kiểm tra tối đa 5 cuốn)", true],
            ["POST /api/loans/:id/return trong transaction", true],
            ["POST /api/loans/:id/renew (1 lần, +7 ngày)", true],
            ["Viết Swagger cho nhóm endpoint này", false],
          ],
          comments: [
            ["mentortuan", "Đã xem, transaction ổn. Nhớ bắt lỗi khi hai người mượn cùng một bản sao."],
            ["duyhung", "Dạ, em dùng cập nhật có điều kiện trên trạng thái bản sao rồi ạ."],
          ],
        },
        {
          title: "Màn hình tìm kiếm sách + bộ lọc (React)",
          col: 2,
          desc: "Tìm theo tiêu đề/tác giả, lọc theo thể loại và tình trạng còn sách; debounce 300ms.",
          labels: ["Giao diện"],
          assignees: ["thu", "vietdung"],
          points: 5,
          startInDays: -6,
          dueInDays: 1,
          comments: [
            ["vietdung", "Mình review nhánh feat/search: còn thiếu trạng thái rỗng khi không có kết quả."],
            ["thu", "Mình bổ sung ngay trong tối nay ạ."],
          ],
        },
        // Hoàn thành
        {
          title: "Chương 1: Giới thiệu đề tài (lý do, mục tiêu, phạm vi)",
          col: 3,
          desc: "Đã duyệt, có thêm đoạn thực trạng quản lý thư viện thủ công ở trường.",
          labels: ["Báo cáo"],
          assignees: ["ngoclan"],
          points: 3,
          startInDays: -14,
          dueInDays: -3,
          comments: [["ngocdiep", "Đã duyệt nhé Lan, cảm ơn bạn."]],
        },
        {
          title: "ERD v2: Sach, BanSao, DocGia, PhieuMuon, ChiTietMuon, Phat",
          col: 3,
          desc: "Chốt quan hệ, embed ChiTietMuon vào PhieuMuon, tách Phat thành collection riêng.",
          labels: ["CSDL"],
          assignees: ["phuocloi"],
          points: 5,
          startInDays: -12,
          dueInDays: -4,
          checklist: [
            ["Xác định thực thể và thuộc tính", true],
            ["Quan hệ 1–N / N–N", true],
            ["Quyết định embed hay reference", true],
            ["Index đề xuất", true],
          ],
          comments: [["mentortuan", "Tách Sach và BanSao rất đúng, giữ nguyên nhé."]],
        },
        {
          title: "Khảo sát nghiệp vụ tại thư viện trường (phỏng vấn thủ thư)",
          col: 3,
          desc: "Xác nhận quy trình mượn–trả thực tế và các quy định về thời hạn, mức phạt.",
          labels: ["Báo cáo"],
          assignees: ["ngocdiep", "ngoclan"],
          points: 3,
          startInDays: -20,
          dueInDays: -12,
          comments: [["ngoclan", "Biên bản phỏng vấn mình đã đưa vào phụ lục."]],
        },
      ],
    },
  ],
  studySets: [
    {
      slug: "capstone-co-so-du-lieu-erd",
      title: "Cơ sở dữ liệu & thiết kế ERD",
      description: "Khoá chính/ngoại, quan hệ, chuẩn hoá, SQL cơ bản và cách thiết kế ERD cho hệ thống thư viện.",
      tags: ["co-so-du-lieu", "erd", "sql", "mongodb"],
      language: "vi",
      visibility: "WORKSPACE",
      owner: "phuocloi",
      items: [
        {
          type: "FLASHCARD",
          prompt: "Khoá chính (Primary key) là gì?",
          answerText:
            "Thuộc tính (hoặc tập thuộc tính) xác định duy nhất mỗi bản ghi trong bảng; không được NULL và không được trùng.",
        },
        {
          type: "FLASHCARD",
          prompt: "Khoá ngoại (Foreign key) dùng để làm gì?",
          answerText:
            "Tham chiếu tới khoá chính của bảng khác để biểu diễn quan hệ và đảm bảo toàn vẹn tham chiếu.",
        },
        {
          type: "FLASHCARD",
          prompt: "Các loại quan hệ (cardinality) trong ERD? Quan hệ N–N được cài đặt thế nào?",
          answerText:
            "1–1, 1–N và N–N. Khi cài đặt, quan hệ N–N được tách thành bảng trung gian chứa hai khoá ngoại.",
        },
        {
          type: "FLASHCARD",
          prompt: "Yêu cầu của dạng chuẩn 1NF, 2NF, 3NF?",
          answerText:
            "1NF: mỗi thuộc tính nguyên tử, không có nhóm lặp. 2NF: đạt 1NF và mọi thuộc tính không khoá phụ thuộc đầy đủ vào khoá chính. 3NF: đạt 2NF và không có phụ thuộc bắc cầu vào khoá chính.",
        },
        {
          type: "FLASHCARD",
          prompt: "Thực thể yếu (weak entity) là gì? Ví dụ trong hệ thống thư viện?",
          answerText:
            "Thực thể không thể định danh độc lập mà phụ thuộc vào một thực thể mạnh. Ví dụ ChiTietMuon phụ thuộc vào PhieuMuon.",
        },
        {
          type: "FLASHCARD",
          prompt: "ACID gồm những tính chất nào?",
          answerText:
            "Atomicity (nguyên tử), Consistency (nhất quán), Isolation (cô lập), Durability (bền vững).",
        },
        {
          type: "FLASHCARD",
          prompt: "Khi nào nên embed, khi nào nên reference trong MongoDB?",
          answerText:
            "Embed khi dữ liệu luôn đọc cùng nhau và số phần tử bị chặn trên (ví dụ chi tiết phiếu mượn tối đa 5). Reference khi dữ liệu dùng độc lập, thay đổi riêng hoặc có thể lớn không giới hạn.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Quan hệ giữa DocGia và PhieuMuon (một độc giả có nhiều phiếu, mỗi phiếu thuộc một độc giả) là?",
          options: ["1–N (một–nhiều)", "N–N", "1–1", "Không có quan hệ"],
          correctIndex: 0,
          explanation: "Phía DocGia là 1, phía PhieuMuon là nhiều; khoá ngoại docGiaId đặt ở PhieuMuon.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Phép nối nào trả về tất cả bản ghi của bảng bên trái, kể cả khi không có bản ghi khớp bên phải?",
          options: ["LEFT JOIN", "INNER JOIN", "CROSS JOIN", "SELF JOIN"],
          correctIndex: 0,
          explanation: "LEFT JOIN giữ toàn bộ dòng bảng trái; cột bên phải là NULL nếu không khớp.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Ràng buộc nào đảm bảo không có hai độc giả trùng mã sinh viên?",
          options: ["UNIQUE", "CHECK", "DEFAULT", "NOT NULL"],
          correctIndex: 0,
          explanation: "UNIQUE bắt buộc giá trị của cột không được trùng; NOT NULL chỉ cấm giá trị rỗng.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Để đếm số lần mượn của từng độc giả bằng SQL, ta kết hợp COUNT() với mệnh đề nào?",
          options: ["GROUP BY", "ORDER BY", "DISTINCT", "LIMIT"],
          correctIndex: 0,
          explanation: "SELECT docGiaId, COUNT(*) FROM PhieuMuon GROUP BY docGiaId;",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Một bảng có thể có nhiều khoá ngoại.",
          correct: true,
          explanation: "Ví dụ ChiTietMuon có khoá ngoại tới PhieuMuon và tới BanSao.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Quan hệ N–N có thể cài đặt trực tiếp chỉ bằng một khoá ngoại duy nhất giữa hai bảng.",
          correct: false,
          explanation: "Cần bảng trung gian chứa hai khoá ngoại (hoặc, trong MongoDB, mảng tham chiếu).",
        },
        {
          type: "FILL_BLANK",
          prompt: "Câu lệnh SQL để lấy dữ liệu từ bảng: ______ * FROM Sach;",
          accepted: ["select"],
          explanation: "SELECT chọn cột cần lấy; dấu * nghĩa là tất cả cột.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Dạng chuẩn loại bỏ phụ thuộc bắc cầu của thuộc tính không khoá vào khoá chính là dạng chuẩn thứ ______ (điền số).",
          accepted: ["3", "ba"],
          explanation: "3NF loại bỏ phụ thuộc bắc cầu.",
        },
      ],
    },
    {
      slug: "capstone-nodejs-express-rest",
      title: "Node.js, Express & REST",
      description: "Những kiến thức hay gặp khi viết API Node/Express cho đồ án và khi trả lời hội đồng.",
      tags: ["nodejs", "express", "rest", "backend"],
      language: "vi",
      visibility: "WORKSPACE",
      owner: "duyhung",
      items: [
        {
          type: "FLASHCARD",
          prompt: "Node.js là gì? Vì sao nói nó xử lý I/O “không chặn” (non-blocking)?",
          answerText:
            "Môi trường chạy JavaScript phía máy chủ dựa trên engine V8. Nhờ vòng lặp sự kiện (event loop) và I/O bất đồng bộ, một luồng JS có thể phục vụ nhiều kết nối mà không đứng chờ I/O.",
        },
        {
          type: "FLASHCARD",
          prompt: "Middleware trong Express là gì?",
          answerText:
            "Hàm nhận (req, res, next), chạy tuần tự trước handler cuối; có thể sửa req/res, kết thúc phản hồi hoặc gọi next() để chuyển tiếp. Ví dụ: logging, xác thực, parse JSON.",
        },
        {
          type: "FLASHCARD",
          prompt: "Middleware xử lý lỗi trong Express khác middleware thường thế nào?",
          answerText: "Có 4 tham số (err, req, res, next) và phải được khai báo sau các route/middleware khác.",
        },
        {
          type: "FLASHCARD",
          prompt: "Phân biệt req.params, req.query và req.body?",
          answerText:
            "params: phần động trong đường dẫn (/books/:id); query: phần sau dấu ? (?q=abc); body: dữ liệu gửi kèm trong thân request (cần express.json() để đọc JSON).",
        },
        {
          type: "FLASHCARD",
          prompt: "async/await dùng để làm gì?",
          answerText:
            "Viết code bất đồng bộ dạng tuần tự dễ đọc trên nền Promise; await tạm dừng hàm async cho tới khi Promise hoàn tất; lỗi bắt bằng try/catch.",
        },
        {
          type: "FLASHCARD",
          prompt: "RBAC là gì?",
          answerText:
            "Role-Based Access Control — phân quyền theo vai trò (độc giả, thủ thư, quản trị); mỗi vai trò có tập quyền riêng và route kiểm tra vai trò qua middleware.",
        },
        {
          type: "FLASHCARD",
          prompt: "Biến môi trường (.env) dùng để làm gì và cần lưu ý gì?",
          answerText:
            "Tách cấu hình nhạy cảm/thay đổi theo môi trường (chuỗi kết nối DB, JWT secret) ra khỏi code; không commit file .env lên Git, chỉ commit .env.example.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Cách đúng để lấy :id từ route GET /books/:id trong Express?",
          options: ["req.params.id", "req.query.id", "req.body.id", "req.header.id"],
          correctIndex: 0,
          explanation: "Tham số trong đường dẫn nằm ở req.params.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Độc giả đã mượn đủ số cuốn tối đa và cố mượn thêm (vi phạm quy tắc nghiệp vụ). Mã trạng thái nào hợp lý?",
          options: [
            "422 Unprocessable Entity (hoặc 409 Conflict)",
            "200 OK",
            "201 Created",
            "301 Moved Permanently",
          ],
          correctIndex: 0,
          explanation: "Thao tác không thành công nên không dùng 2xx; quan trọng là nhóm thống nhất một quy ước.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Hàm nào của thư viện bcrypt dùng để so sánh mật khẩu nhập vào với chuỗi hash đã lưu?",
          options: ["bcrypt.compare()", "bcrypt.decrypt()", "bcrypt.verifyHash()", "bcrypt.unhash()"],
          correctIndex: 0,
          explanation: "bcrypt là hàm băm một chiều nên không giải mã được; chỉ có thể so sánh bằng compare().",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Thứ tự middleware nào hợp lý nhất cho một route cần đăng nhập và cần quyền thủ thư?",
          options: [
            "express.json() → xác thực JWT → kiểm tra vai trò → handler",
            "handler → xác thực JWT → express.json()",
            "kiểm tra vai trò → xác thực JWT → express.json()",
            "xác thực JWT → handler → kiểm tra vai trò",
          ],
          correctIndex: 0,
          explanation: "Phải có thông tin người dùng từ JWT thì mới kiểm tra được vai trò, và mọi việc xong mới tới handler.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Payload của JWT được mã hoá nên có thể đặt mật khẩu vào trong.",
          correct: false,
          explanation: "Payload chỉ được mã hoá Base64URL, ai cũng giải ra đọc được; không đặt dữ liệu nhạy cảm vào JWT.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Trong Express, nếu middleware không gọi next() và cũng không gửi phản hồi thì request sẽ bị treo.",
          correct: true,
          explanation: "Phải kết thúc phản hồi hoặc gọi next() để chuyển tiếp.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Lệnh cài đặt Express bằng npm: npm ______ express",
          accepted: ["install", "i"],
          explanation: "npm i là cách viết tắt của npm install.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Để khởi động server Express lắng nghe cổng 3000: app.______(3000)",
          accepted: ["listen"],
          explanation: "app.listen(port, callback) bắt đầu lắng nghe kết nối.",
        },
      ],
    },
    {
      slug: "capstone-thuyet-trinh-bao-ve",
      title: "Kỹ năng thuyết trình & bảo vệ đồ án",
      description: "Cấu trúc bài nói, cách làm slide demo và các câu hỏi phản biện thường gặp khi bảo vệ đồ án.",
      tags: ["thuyet-trinh", "bao-ve-do-an", "ky-nang"],
      language: "vi",
      visibility: "PUBLIC",
      owner: "ngoclan",
      items: [
        {
          type: "FLASHCARD",
          prompt: "Một bài bảo vệ đồ án 15 phút nên chia thời gian thế nào?",
          answerText:
            "Gợi ý: Đặt vấn đề & mục tiêu (2 phút), Phân tích & thiết kế (4 phút), Demo (5 phút), Kết quả & kiểm thử (2 phút), Kết luận & hướng phát triển (2 phút).",
        },
        {
          type: "FLASHCARD",
          prompt: "Hội đồng hỏi: “Vì sao em chọn MongoDB mà không phải SQL cho hệ thống thư viện?” — trả lời thế nào?",
          answerText:
            "Nêu lý do cụ thể rồi thừa nhận đánh đổi: dữ liệu linh hoạt, embed chi tiết phiếu mượn gọn, truy vấn tìm kiếm thuận tiện; thừa nhận SQL mạnh hơn về ràng buộc quan hệ nên nhóm bù bằng validation ở tầng ứng dụng và transaction.",
        },
        {
          type: "FLASHCARD",
          prompt: "Hai người cùng mượn một bản sao sách vào cùng lúc: hệ thống xử lý thế nào?",
          answerText:
            "Dùng cập nhật có điều kiện nguyên tử (findOneAndUpdate với điều kiện trạng thái = sẵn sàng) hoặc transaction; chỉ một thao tác thành công, thao tác còn lại nhận lỗi “sách không còn sẵn”.",
        },
        {
          type: "FLASHCARD",
          prompt: "Mật khẩu người dùng được bảo vệ như thế nào trong hệ thống của nhóm?",
          answerText:
            "Băm bằng bcrypt (có salt, cost phù hợp), không lưu mật khẩu gốc; token JWT có thời hạn ngắn và truyền qua HTTPS.",
        },
        {
          type: "FLASHCARD",
          prompt: "Gặp câu hỏi mình chưa biết trả lời thì nên làm gì?",
          answerText:
            "Giữ bình tĩnh, nói thật điều chưa chắc, trình bày phần mình hiểu và hướng giải quyết dự kiến; không bịa. Có thể xin phép ghi nhận và bổ sung sau.",
        },
        {
          type: "FLASHCARD",
          prompt: "Nên nói về hạn chế và hướng phát triển của đề tài như thế nào?",
          answerText:
            "Nêu thẳng 2–3 hạn chế thật (ví dụ chưa có đặt trước, chưa gửi thông báo qua email) và đề xuất hướng khắc phục; điều này thể hiện nhóm hiểu rõ sản phẩm của mình.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Slide demo nên ưu tiên điều gì?",
          options: [
            "Ảnh chụp và luồng thao tác thật của hệ thống, ít chữ",
            "Dán toàn bộ đoạn code",
            "Đọc nguyên văn từng dòng chữ trên slide",
            "Thật nhiều hiệu ứng chuyển cảnh",
          ],
          correctIndex: 0,
          explanation: "Slide hỗ trợ lời nói; ảnh thật thuyết phục hơn nhiều so với văn bản dày đặc.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Với phần demo trực tiếp, việc chuẩn bị nào quan trọng nhất?",
          options: [
            "Dữ liệu mẫu sạch, kịch bản từng bước và video dự phòng",
            "Chỉ chạy thử một lần vào sáng ngày bảo vệ",
            "Dùng dữ liệu thật của người dùng",
            "Nâng cấp toàn bộ thư viện lên bản mới ngay trước giờ bảo vệ",
          ],
          correctIndex: 0,
          explanation: "Demo hay trục trặc bất ngờ; có kịch bản và video dự phòng giúp bình tĩnh xử lý.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Khi trả lời câu hỏi phản biện, cách làm tốt nhất là?",
          options: [
            "Trả lời thẳng vào câu hỏi trước, sau đó giải thích lý do",
            "Nói lan man để câu giờ",
            "Phản bác lại hội đồng",
            "Chuyển sang slide khác",
          ],
          correctIndex: 0,
          explanation: "Trả lời trực tiếp, ngắn gọn, có lập luận sẽ tạo thiện cảm hơn.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Mục tiêu chính của phần “Kết quả & kiểm thử” là?",
          options: [
            "Chứng minh hệ thống đáp ứng yêu cầu đã đặt ra bằng số liệu và ca kiểm thử",
            "Liệt kê tất cả lỗi cú pháp đã sửa",
            "Giới thiệu các thành viên nhóm",
            "Kể lại quá trình cài đặt IDE",
          ],
          correctIndex: 0,
          explanation: "Phần này đối chiếu kết quả với yêu cầu ở chương phân tích.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Nên đọc nguyên văn nội dung trên slide trong lúc trình bày.",
          correct: false,
          explanation: "Người nghe đã đọc được slide; hãy diễn giải và nhấn mạnh ý chính.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Nên tập thuyết trình có bấm giờ ít nhất vài lần trước ngày bảo vệ.",
          correct: true,
          explanation: "Tập có bấm giờ giúp kiểm soát thời lượng và phát hiện chỗ nói chưa mạch lạc.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Câu hỏi “Đề tài của em khác gì các phần mềm thư viện đã có?” kiểm tra tính ______ của đề tài.",
          accepted: ["mới", "tính mới"],
          explanation: "Hội đồng muốn biết điểm mới/khác biệt của đề tài so với các giải pháp đã có.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Phần mở đầu của bài nói nêu lý do chọn đề tài, mục tiêu và ______ của đề tài.",
          accepted: ["phạm vi"],
          explanation: "Lý do – mục tiêu – phạm vi là bộ ba quen thuộc của phần mở đầu.",
        },
      ],
    },
  ],
  expenses: [
    {
      paidBy: "ngocdiep",
      amount: 60000,
      description: "Grab đi gặp thủ thư thư viện trường để khảo sát nghiệp vụ",
      category: "TRANSPORT",
      among: ["ngocdiep", "ngoclan", "phuocloi"],
      daysAgo: 18,
    },
    {
      paidBy: "phuocloi",
      amount: 100000,
      description: "Photo biểu mẫu khảo sát và tài liệu quy định mượn–trả",
      category: "PRINTING",
      among: ["ngocdiep", "phuocloi", "ngoclan", "thu"],
      daysAgo: 14,
    },
    {
      paidBy: "ngoclan",
      amount: 150000,
      description: "In bản nháp báo cáo chương 1–2 gửi thầy hướng dẫn",
      category: "PRINTING",
      among: ["ngocdiep", "ngoclan", "phuocloi", "thu", "thuhien"],
      daysAgo: 9,
    },
    {
      paidBy: "ngocdiep",
      amount: 240000,
      description: "Cà phê buổi họp nhóm ở quán gần trường",
      category: "FOOD",
      among: ["ngocdiep", "phuocloi", "ngoclan", "thu", "thuhien", "duyhung", "vietdung", "phuongthao"],
      daysAgo: 6,
    },
    {
      paidBy: "ngocdiep",
      amount: 320000,
      description: "Thuê máy chiếu + phòng tập thuyết trình thử lần 1",
      category: "OTHER",
      among: ["ngocdiep", "phuocloi", "ngoclan", "thu", "thuhien", "duyhung", "vietdung", "phuongthao"],
      daysAgo: 3,
    },
  ],
};
