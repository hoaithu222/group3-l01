/**
 * Văn bản biên bản họp mẫu (markdown-lite của app) theo khoá kế hoạch (`khoá`) hoặc buổi của chuỗi (`khoá#số-buổi`). `{khoá-người}` = tên người,
 * `{+N}` = ngày dd/MM sau ngày họp N ngày — được thay lúc seed (xem `renderText` ở `meetings.resolve.ts`).
 */
export const RECAP_TEXT: Readonly<Record<string, string>> = {
  "frontend:wk1": `### Tóm tắt
Cả nhóm demo landing page tuần 1. Phần lớn đã bố cục xong bằng Flexbox, còn vài bạn bị tràn ngang khi thu nhỏ màn hình dưới 480px. {mentorson} góp ý nên đặt tên class theo BEM để về sau dễ đọc và dễ sửa.

### Quyết định
- Review code chéo qua Pull Request, mỗi PR cần ít nhất 1 người duyệt trước khi merge.
- Dùng Flexbox cho bố cục một chiều, Grid cho bố cục lưới; tuần 2 làm đủ 10 layout trong bài tập.
- Họp nhóm cố định mỗi tuần vào 20:00 tối.

### Việc cần làm
- [ ] {ducanh} sửa lỗi tràn ngang trên điện thoại cho landing page — hạn {+2}
- [ ] {thuytrang} gửi cheat-sheet specificity & box model 1 trang A4 — hạn {+3}
- [ ] {phuongthao} soát a11y và responsive cho landing page cả nhóm — hạn {+4}
- [ ] {khanhlinh} cập nhật bảng tổng hợp MDN, flexbox, grid lên kênh Tài liệu — hạn {+1}`,
  "math:de-giua-ky": `### Tóm tắt
Cả nhóm làm lại đề giữa kỳ Giải tích 1 năm 2024 rồi chữa chéo. Câu 3 (giới hạn dạng 0/0) nhiều bạn quên giới hạn đáng nhớ hoặc khai triển Taylor; câu 4 (cực trị) gần như đúng hết; câu 5 (tích phân từng phần) hay sai dấu ở lần lấy tích phân thứ hai. {gvhung} nhắc: luôn kiểm tra điều kiện hội tụ trước khi kết luận ở bài tích phân suy rộng.

### Quyết định
- Mỗi bạn tự làm lại đề 2023 bấm giờ 60 phút, đăng ảnh bài làm lên kênh Đề thi & lời giải trước buổi họp sau.
- Chữa bài theo nhóm 3 người, chấm chéo bằng đáp án của thầy.
- Bảng công thức 1 trang bổ sung phần khai triển Taylor và các giới hạn đáng nhớ.

### Việc cần làm
- [ ] {baotram} gom đề thi 2023 và 2025 đăng lên kênh Đề thi & lời giải — hạn {+2}
- [ ] {trungkien} viết lời giải mẫu câu 3 bằng khai triển Taylor — hạn {+3}
- [ ] {yennhi} cập nhật bảng công thức 1 trang — hạn {+4}
- [ ] {hieutrung} tổng hợp các bài tích phân từng phần hay sai dấu — hạn {+3}`,
  "appdev:demo-ui": `### Tóm tắt (nháp)
Demo Figma v1: 4 màn hình Đăng nhập, Trang chủ, Thêm khoản chi, Thống kê. Màn Thêm khoản chi dùng bàn phím số lớn, danh mục dạng lưới icon, ghi chú là ô tuỳ chọn.

### Quyết định
- Số tiền nhập theo nhóm nghìn (1.500.000), chỉ nhận chữ số — tránh lỗi dấu chấm làm crash app.
- Token màu dùng chung cho sáng/tối đặt trong một file theme.

### Việc cần làm
- [ ] {hoanglong} làm màn Thêm khoản chi theo layout đã chốt
- [ ] {minhanh} hoàn thiện theme sáng/tối
- [ ] {thuytrang} bổ sung icon danh mục còn thiếu`,
  "ielts:tuan3": `### Tóm tắt
{mentorha} điểm lại bài Task 2 đề Early education. Ba lỗi lặp nhiều nhất: thiếu mạo từ trước danh từ đếm được số ít, dùng sai thì khi nêu ví dụ quá khứ, và đoạn thân bài thiếu câu chốt ý. Cách sửa nhanh: mỗi đoạn viết theo khung "ý chính – giải thích – ví dụ – liên hệ lại đề".

### Quyết định
- Mỗi tuần nộp 1 bài Task 2 lên kênh Chấm Writing với cô Hà trước tối Chủ nhật.
- Dùng sổ tay lỗi ngữ pháp chung, ai gặp lỗi mới thì thêm vào.
- Dành 5 phút cuối mỗi buổi họp để đọc lại một đoạn văn tốt của bạn trong nhóm.

### Việc cần làm
- [ ] {quynhnhu} viết lại bài Task 2 đề 1 theo nhận xét của cô — hạn {+4}
- [ ] {khanhlinh} cập nhật sổ tay lỗi ngữ pháp với 5 lỗi mới — hạn {+3}
- [ ] {anhthu} tổng hợp 10 cụm nối ý (linking words) hay dùng cho bài Task 2 — hạn {+5}`,
  "ielts:speaking": `### Tóm tắt
Nhóm luyện nói theo cặp: mỗi người nói Part 2 khoảng 2 phút rồi trả lời Part 3 do bạn cùng cặp hỏi. Điểm chung: ý còn ngắn, ít dùng lý do và ví dụ; một số bạn dừng lâu để nghĩ từ. {camtu} nhắc nên dùng khung "ý chính – lý do – ví dụ – kết" cho Part 3.

### Quyết định
- Giữ lịch luyện nói 2 buổi/tuần, mỗi buổi đổi cặp.
- Ghi âm lại phần Part 2 của mình để tự nghe và gửi cô Hà nhận xét.

### Việc cần làm
- [ ] {hieutrung} gửi file ghi âm Part 2 cho cô Hà — hạn {+2}
- [ ] {anhthu} chuẩn bị 5 câu hỏi Part 3 chủ đề Technology — hạn {+3}
- [ ] {camtu} chia cặp luyện nói cho tuần sau — hạn {+2}`,
  "dsa:tuan2": `### Tóm tắt
Nhóm rà tiến độ tuần 2. Danh sách liên kết đã xong; Stack/Queue đang làm bài tập. Thống nhất cài queue vòng bằng mảng với hai biến head/tail và kiểm tra rỗng/đầy bằng đếm số phần tử, tránh nhầm khi head == tail.

### Quyết định
- Mock test cuối tuần 2 gồm 10 câu trắc nghiệm và 2 bài code, làm trong 60 phút.
- Mỗi người nộp bài code lên kênh Mảng & Danh sách liên kết, chấm chéo theo cặp.
- Cheat sheet A4 viết tay do {khanhlinh} tổng hợp, mọi người góp phần của mình.

### Việc cần làm
- [ ] {haidang} ra đề mock test tuần 2 — hạn {+2}
- [ ] {tuankiet} chuẩn bị 30 bài LeetCode Easy theo chủ đề — hạn {+3}
- [ ] {trungkien} giải thích cài đặt Stack bằng hai Queue ở buổi sau — hạn {+4}`,
  "dsa:chua-de": `### Tóm tắt
Chữa đề thi 3 năm gần nhất. Phần đồ thị là chỗ mất điểm nhiều nhất: nhiều bạn nhầm khi nào dùng BFS, khi nào dùng DFS, và quên khởi tạo mảng visited. Câu về BST hay sai ở trường hợp xoá nút có hai con (phải thay bằng nút kế vị).

### Quyết định
- Dành riêng 1 buổi cho đồ thị: BFS/DFS và Dijkstra, mỗi người tự vẽ ví dụ.
- Khi trình bày lời giải luôn nêu độ phức tạp thời gian và bộ nhớ.
- Câu hỏi chưa chắc chắn gom vào cột "Cần thảo luận" trên bảng.

### Việc cần làm
- [ ] {minhkhoi} chuẩn bị bài giảng nhanh về BFS/DFS và Dijkstra — hạn {+3}
- [ ] {trungkien} viết lại lời giải xoá nút BST có hai con — hạn {+2}
- [ ] {phuongthao} tổng hợp các lỗi hay gặp thành một trang — hạn {+4}`,
  "backend:retro4": `### Tóm tắt
Retro Sprint 4: làm tốt là chia module rõ ràng và review code kịp; cần cải thiện là PR quá lớn, thiếu test cho phần auth. Sprint 5 làm API đặt sân thể thao (Court, Booking) từ schema đến deploy, ước lượng tổng 34 story points.

### Quyết định
- Mỗi PR dưới 300 dòng thay đổi, kèm mô tả và cách chạy thử.
- Bắt buộc có test cho endpoint mới (Supertest) trước khi merge.
- Sprint 5 kéo dài 2 tuần; họp giữa sprint để demo.

### Việc cần làm
- [ ] {phuocloi} thiết kế schema Prisma (User, Court, Booking) — hạn {+2}
- [ ] {duyhung} làm API đăng ký/đăng nhập JWT (access + refresh) — hạn {+4}
- [ ] {giahuy} viết Dockerfile multi-stage và workflow CI — hạn {+7}
- [ ] {tuankiet} nghiên cứu cách chống trùng giờ đặt sân — hạn {+5}`,
  "backend:review-booking": `### Tóm tắt
{mentortuan} cùng cả nhóm đọc PR API đặt sân. Logic kiểm tra overlap đúng (start < end của lịch kia và end > start của lịch kia), nhưng chỉ kiểm bằng truy vấn rồi mới tạo nên vẫn có thể trùng khi hai request đến cùng lúc. Cần thêm ràng buộc unique theo (sân, khung giờ) ở tầng DB.

### Quyết định
- Thêm khoá duy nhất theo (courtId, slotStart) và bắt lỗi P2002 trả mã 409.
- Chuẩn hoá giờ đặt sân theo múi giờ Asia/Ho_Chi_Minh, lưu UTC trong DB.
- Viết thêm test đua: gọi 2 request song song cho cùng một khung giờ.

### Việc cần làm
- [ ] {tuankiet} thêm unique index và xử lý P2002 — hạn {+2}
- [ ] {phuongthao} viết test đặt sân song song bằng Supertest — hạn {+3}
- [ ] {haidang} cập nhật tài liệu Swagger cho endpoint đặt sân — hạn {+5}`,
  "capstone:erd": `### Tóm tắt
Nhóm rà ERD v2. Tách rõ Sach (đầu sách) và BanSao (từng bản vật lý có mã vạch) để theo dõi mượn–trả chính xác. Phiếu mượn có nhiều chi tiết mượn; tiền phạt tách riêng thành bảng Phat gắn với chi tiết mượn trễ hạn. {mentortuan} lưu ý đặt chỉ mục cho mã vạch và mã độc giả.

### Quyết định
- Giữ nguyên ERD v2; bổ sung trường trạng thái cho BanSao (sẵn sàng, đang mượn, hỏng, mất).
- Phạt trễ hạn tính theo số ngày trễ nhân mức phạt mỗi ngày do thủ thư cấu hình.
- Chương 3 chia ba phần: use case, ERD, thiết kế API.

### Việc cần làm
- [ ] {ngoclan} hoàn thiện Chương 3 phần use case và ERD — hạn {+5}
- [ ] {phuocloi} cập nhật schema MongoDB và index theo ERD v2 — hạn {+3}
- [ ] {thu} viết Chương 2: cơ sở lý thuyết (React, Node/Express, MongoDB, JWT) — hạn {+7}
- [ ] {duyhung} hoàn thiện API mượn/trả/gia hạn có transaction — hạn {+4}`,
  "uiux:workshop-figma": `### Tóm tắt
{thaonguyen} hướng dẫn tạo Component nút bấm có variant theo hai thuộc tính: kích thước (S, M, L) và trạng thái (mặc định, nhấn, vô hiệu). Auto layout giúp thẻ danh sách tự co giãn theo nội dung; nên đặt tên layer rõ ràng và dùng khoảng cách theo lưới 8pt.

### Quyết định
- Toàn bộ đồ án dùng chung một file Design System, mỗi người chỉ sửa trong nhánh (branch) của mình.
- Đặt tên Component theo dạng Nhóm/Tên/Trạng thái (ví dụ Button/Primary/Default).
- Màu và chữ lấy từ Styles, không tô màu trực tiếp.

### Việc cần làm
- [ ] {thuytrang} dựng bảng màu pastel thành Color Styles — hạn {+4}
- [ ] {thuhien} dựng thư viện Component: Button, Input, Card — hạn {+6}
- [ ] {khanhlinh} thử Auto layout cho thẻ nhóm ở màn hình Home — hạn {+3}`,
  "uiux:critique1": `### Tóm tắt
Nhóm góp ý wireframe Đăng nhập và Home. Điều tốt: luồng Đăng nhập gọn, nút chính nổi bật. Điều chưa rõ: màn Home chưa phân biệt được "việc hôm nay" với danh sách nhóm; khoảng cách giữa các thẻ chưa đều. Gợi ý: đưa "việc hôm nay" lên đầu và giữ khoảng cách theo lưới 8pt.

### Quyết định
- Màn Home chia hai khu: "Việc hôm nay" ở trên, danh sách nhóm ở dưới.
- Nút "Tiếp tục với Google" đặt dưới form đăng nhập bằng email.
- Buổi critique sau sẽ bàn về bảng màu pastel và design system.

### Việc cần làm
- [ ] {thu} chỉnh wireframe Home theo góp ý — hạn {+3}
- [ ] {thaonguyen} sửa wireframe Đăng nhập/Đăng ký — hạn {+2}
- [ ] {thuytrang} hoàn thiện bảng màu pastel v1 — hạn {+4}`,
  "appdev:sprint-weekly#0": `### Tóm tắt
Họp sprint đầu tiên của dự án Tiêu Gọn. Nhóm rà lại phạm vi MVP (đăng nhập, thêm khoản chi, thống kê tuần) và chia việc cho tuần này. {mentortuan} lưu ý chốt quy ước branch/commit trước khi code nhiều.

### Quyết định
- MVP chỉ gồm: Đăng nhập/Đăng ký, Thêm khoản chi, Danh sách giao dịch, Thống kê theo tuần. Thông báo nhắc ghi chép để sprint sau.
- Mỗi tính năng một nhánh \`feat/<tên>\`, commit theo Conventional Commits, PR cần 1 người review.
- Họp sprint cố định tối thứ Hai, 20:00.

### Việc cần làm
- [ ] {quocbao} hoàn thành API auth và schema users/transactions — hạn {+4}
- [ ] {hoanglong} làm màn Đăng nhập/Đăng ký bằng Expo Router — hạn {+4}
- [ ] {thuytrang} xuất Figma v1 cho 4 màn hình chính — hạn {+3}
- [ ] {giahuy} dựng repo và docker-compose Mongo — hạn {+1}`,
  "appdev:sprint-weekly#1": `### Tóm tắt
Cuối sprint đầu: API auth và schema đã xong, màn Đăng nhập/Đăng ký đang review, Figma v1 hoàn tất. Màn Thêm khoản chi bị chậm vì lỗi nhập số tiền có dấu chấm làm app crash. Sprint 2 tập trung vào API /transactions và màn Thêm khoản chi.

### Quyết định
- Ô số tiền chỉ nhận chữ số và hiển thị theo nhóm nghìn, không cho nhập dấu chấm.
- API /transactions dùng phân trang cursor và \`clientId\` để chống tạo trùng khi đồng bộ offline.
- Khảo sát 20–30 sinh viên về thói quen ghi chép chi tiêu chạy song song với phần code.

### Việc cần làm
- [ ] {hoanglong} sửa lỗi crash khi nhập số tiền có dấu chấm — hạn {+2}
- [ ] {duyhung} làm API /transactions CRUD và phân trang cursor — hạn {+5}
- [ ] {thu} gửi form khảo sát cho 20–30 sinh viên — hạn {+4}
- [ ] {thanhtung} dựng biểu đồ cột thống kê theo tuần — hạn {+6}`,
  "capstone:tien-do-weekly#0": `### Tóm tắt
Báo cáo tiến độ với giảng viên hướng dẫn. Chương 1 đã xong, ERD v2 đang hoàn thiện, backend mới có khung Express và phần đăng nhập. Giảng viên nhắc cần chốt rõ phạm vi nghiệp vụ (mượn–trả, gia hạn, phạt trễ hạn) trước khi viết Chương 3.

### Quyết định
- Phạm vi hệ thống gồm 3 vai: độc giả, thủ thư, quản trị; không làm mượn liên thư viện.
- Họp tiến độ cố định chiều thứ Hai, 15:30, qua Google Meet.

### Việc cần làm
- [ ] {phuocloi} hoàn thiện ERD v2 và gửi giảng viên duyệt — hạn {+3}
- [ ] {ngoclan} bắt đầu Chương 3: phân tích yêu cầu — hạn {+6}
- [ ] {duyhung} dựng API mượn/trả có transaction — hạn {+6}`,
  "capstone:tien-do-weekly#1": `### Tóm tắt
ERD v2 đã được giảng viên duyệt. Backend đã xong phần đăng nhập và phân quyền cơ bản; giao diện thủ thư (mượn/trả bằng mã vạch) đang làm. Còn thiếu: tính phạt trễ hạn và bộ test.

### Quyết định
- Tiền phạt tính theo số ngày trễ, cho phép thủ thư miễn/giảm kèm lý do ghi lại.
- Chốt khung báo cáo 5 chương; chương 4 viết sau khi demo chạy ổn.
- Tuần tới nộp bản nháp Chương 3 cho giảng viên đọc.

### Việc cần làm
- [ ] {duyhung} làm tính phạt trễ hạn và miễn/giảm phạt — hạn {+5}
- [ ] {vietdung} hoàn thiện màn hình thủ thư mượn/trả — hạn {+6}
- [ ] {ngocdiep} lên lịch bảo vệ thử và đặt phòng họp — hạn {+4}`,
};
