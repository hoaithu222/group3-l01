import type { DmSpec, GroupChatSpec } from "../types";

/** Hôm nay = 2026-10-03 (thứ Sáu). Thứ Năm tới = 9/10, thi toán thứ Hai 13/10, bảo vệ đồ án thứ Năm 16/10. */

export const dms: DmSpec[] = [
  // 1. minhanh — review PR React, tách component
  {
    peer: "minhanh",
    unreadForThu: 2,
    lines: [
      ["thu", "Minh Anh ơi, bạn rảnh xem giúp mình PR màn hình Thống kê của Tiêu Gọn được không? File ReportScreen dài hơn 400 dòng rồi, mình nhìn mà ngợp 😅"],
      ["minhanh", "Được nè, bạn gửi mình số PR với tên nhánh nhé, lát mình mở xem."],
      ["thu", "PR #42, nhánh feat/report-screen bạn nhé. Cảm ơn bạn trước ạ 🙏"],
      ["minhanh", "Mình xem sơ rồi. Hiện biểu đồ, danh sách giao dịch và bộ lọc tháng đang nằm chung một component. Bạn tách thành 3 phần: MonthFilter, SpendingChart, TransactionList; ReportScreen chỉ lo lấy dữ liệu rồi ghép lại."],
      ["thu", "Tách rồi thì state selectedMonth để ở đâu hả bạn? Mình sợ phải truyền props qua nhiều tầng quá."],
      ["minhanh", "Giữ ở ReportScreen thôi, truyền xuống hai tầng là ổn, chưa cần Context. Sau này nhiều màn cùng dùng thì mới tính tới Context hoặc Zustand.", { reply: 4 }],
      ["thu", "Okê mình hiểu. Còn mấy hàm tính tổng theo danh mục thì mình đang viết thẳng trong component, bạn thấy sao?"],
      ["minhanh", "Đưa ra file utils/report.ts luôn, viết thành hàm thuần: nhận mảng giao dịch, trả về tổng theo từng danh mục. Dễ test mà component cũng gọn. Trong component thì bọc bằng useMemo để khỏi tính lại mỗi lần render.", { react: { "👍": ["thu"] } }],
      ["thu", "Hay quá, cảm ơn bạn nhiều nha 🙏 Chiều nay mình tách xong rồi push lại.", { react: { "❤️": ["minhanh"] } }],
      ["minhanh", "Ok bạn, push xong nhắn mình, mình approve nhanh cho 😄"],
      ["minhanh", "À nhớ đặt tên props cho rõ nữa, kiểu onMonthChange chứ đừng onChange chung chung, đọc code đỡ phải đoán.", { edited: true }],
    ],
  },

  // 2. quocbao — format response API, 401 hết hạn token
  {
    peer: "quocbao",
    pinned: true,
    lines: [
      ["thu", "Bảo ơi, mình với Long đang gọi API bên backend mà mỗi endpoint trả một kiểu: chỗ thì có data, chỗ thì trả thẳng mảng. Mình thống nhất một format chung được không?"],
      ["quocbao", "Ừ, lỗi của mình. Đề xuất: thành công { success: true, data, meta? }, lỗi { success: false, error: { code, message } }."],
      ["thu", "Nghe ổn. Còn phân trang thì sao?"],
      ["quocbao", "Nằm trong meta: { page, limit, total }. Danh sách thì data là mảng.", { reply: 2 }],
      ["thu", "Ok. Vấn đề thứ hai: token hết hạn thì app nhận 401 nhưng message lúc là 'Unauthorized', lúc là 'jwt expired', app không phân biệt được để biết khi nào cần refresh."],
      ["quocbao", "Mình chuẩn hoá: hết hạn trả 401 + error.code = TOKEN_EXPIRED; thiếu hoặc sai token trả 401 + INVALID_TOKEN. App chỉ refresh khi gặp TOKEN_EXPIRED.", { pin: true }],
      ["thu", "Vậy flow bên app là: gặp TOKEN_EXPIRED → gọi /auth/refresh bằng refresh token → gọi lại request cũ, đúng không?"],
      ["quocbao", "Đúng. Lưu ý chỉ refresh một lần cho nhiều request song song, không thì bắn nhiều refresh cùng lúc, refresh token bị thu hồi luôn.", { react: { "👍": ["thu"] } }],
      ["thu", "À đúng, mình sẽ làm một promise dùng chung cho việc refresh. Còn nếu chính refresh cũng 401 thì mình đăng xuất luôn."],
      ["quocbao", "👍 Mục HTTP status trên https://developer.mozilla.org có mô tả 401 vs 403, bạn đọc qua để thống nhất cách dùng với Long."],
      ["quocbao", "Mình cập nhật xong sẽ báo trong nhóm Tiêu Gọn, chiều nay là xong."],
      ["thu", "Tuyệt, cảm ơn Bảo nhiều 🙏", { react: { "🙌": ["quocbao"] } }],
    ],
  },

  // 3. thuytrang — góp ý Figma màn hình Home, hẹn critique
  {
    peer: "thuytrang",
    unreadForThu: 1,
    lines: [
      ["thuytrang", "Thuuu ơi mình vừa đẩy bản Home v3 lên Figma rồi nè 🎨✨ bạn xem giúp mình nha https://www.figma.com"],
      ["thu", "Mình xem rồi nè. Tổng thể xinh lắm, tone pastel hợp với app chi tiêu cho sinh viên 🥰", { react: { "💖": ["thuytrang"] } }],
      ["thu", "Mình có vài góp ý: (1) số dư to nhưng màu xanh nhạt trên nền kem hơi khó đọc; (2) nút thêm chi tiêu nằm góc phải phía trên, ngón cái khó với tới; (3) hai card 'Hôm nay' với 'Tuần này' nhìn hơi giống nhau."],
      ["thuytrang", "Á đúng á 😮 mình check contrast thấy chỉ khoảng 2.8:1 thôi, chưa đạt 4.5:1. Mình đậm màu số dư lại nha!", { reply: 2 }],
      ["thuytrang", "Còn nút thêm thì mình chuyển thành FAB ở góc dưới bên phải, được hông bạn? 💗"],
      ["thu", "FAB ok luôn, nhưng đừng đè lên tab bar nhé, chừa khoảng 16px."],
      ["thuytrang", "Okiee 📏 Còn card thì mình định cho 'Hôm nay' to hơn, 'Tuần này' thành dạng thanh nhỏ có sparkline."],
      ["thu", "Hay đó. Mình nghĩ nên có buổi critique cả nhóm cho Home trước khi dev bắt tay làm, để Long với Minh Anh góp ý luôn. Bạn rảnh tối mai hay Chủ nhật?"],
      ["thuytrang", "Chủ nhật 20h được hông? Mình up bản v4 trước 18h luôn 🌸"],
      ["thu", "Chủ nhật 20h ok. Mình tạo Google Meet rồi gửi link vào nhóm nha."],
      ["thu", "Cảm ơn Trang nhiều nha!"],
      ["thuytrang", "À mình có thêm bản dark mode nữa, Chủ nhật show luôn nha 🌙✨"],
    ],
  },

  // 4. ngocdiep — deadline đồ án quản lý thư viện, chia việc chương 3
  {
    peer: "ngocdiep",
    lines: [
      ["ngocdiep", "Thu ơi, nhắc nhẹ: bản nháp chương 3 cần xong trước thứ Hai 6/10 để mình gộp với chương 1–2 rồi gửi thầy xem. Bảo vệ là thứ Năm 16/10, còn đúng hai tuần nữa thôi."],
      ["thu", "Mình nhớ rồi Diệp. Chương 3 mình với mọi người chia việc thế nào để mình nắm?"],
      ["ngocdiep", "Chương 3 có 4 mục: 3.1 Phân tích yêu cầu, 3.2 Thiết kế CSDL, 3.3 Thiết kế giao diện, 3.4 Thiết kế API. Mình giao: Lan viết 3.1, Lợi viết 3.2, Thu lo 3.3 + 3.4. Mình tổng hợp và kiểm tra định dạng.", { reply: 1 }],
      ["thu", "Ok, mình nhận 3.3 và 3.4. Hình ERD với use case mình lấy từ Lợi, đúng không?"],
      ["ngocdiep", "Đúng, sơ đồ Lợi đã bỏ ảnh PNG trong thư mục Drive chung rồi. Hình đánh số kiểu Hình 3.1, 3.2... và chú thích ngay bên dưới hình nhé."],
      ["thu", "Rõ. Phần giao diện mình định chụp khoảng 8 màn chính: đăng nhập, danh sách sách, tìm kiếm, mượn/trả, quản lý bạn đọc, thống kê... mỗi màn kèm vài dòng mô tả."],
      ["ngocdiep", "8 màn là vừa đủ rồi 👍 đừng chụp thừa, thầy không thích báo cáo dài mà loãng."],
      ["thu", "Okê. Mình hứa nộp bản nháp trước tối Chủ nhật 5/10 để Diệp còn ngày thứ Hai chỉnh lại."],
      ["ngocdiep", "Vậy thì tuyệt quá 🙏 Mình sợ nhất là dồn việc sát deadline."],
      ["ngocdiep", "Còn cái nữa: thầy yêu cầu font Times New Roman cỡ 13, giãn dòng 1.5, lề trái 3cm. Nhớ đúng mẫu kẻo phải sửa cả file.", { react: { "📌": ["thu"] } }],
      ["thu", "Mình ghi lại rồi. Cảm ơn Diệp đã nhắc 👍"],
      ["ngocdiep", "Không có gì, cùng cố gắng nhé. Qua 16/10 là nhẹ người rồi 😅", { react: { "💪": ["thu"] } }],
    ],
  },

  // 5. kimngan — nhắc quỹ nhóm, chia tiền cà phê
  {
    peer: "kimngan",
    lines: [
      ["kimngan", "Thu ơi, Ngân nhắc nhẹ nhàng nè 🌷 quỹ nhóm tháng 10 là 50.000đ/người, Thu chưa đóng nha."],
      ["thu", "Ối mình quên mất, xin lỗi Ngân 😅 Mà buổi cà phê họp hôm thứ Bảy mình cũng chưa trả Ngân đúng không?"],
      ["kimngan", "Đúng rồi á. Hoá đơn hôm đó 420.000đ, chia 7 người, mỗi người 60.000đ. Ngân ứng trước rồi nha."],
      ["thu", "Vậy tổng mình nợ 50.000 + 60.000 = 110.000đ đúng không?"],
      ["kimngan", "Chuẩn không cần chỉnh luôn 👏 Thu mà làm thủ quỹ chắc nhóm giàu sớm.", { reply: 3 }],
      ["thu", "Không dám đâu, Ngân ghi sổ rõ ràng hơn mình nhiều. Mình chuyển 110.000đ rồi nè, Ngân kiểm tra giúp mình nhé."],
      ["thu", "Nội dung chuyển khoản: Thu - quy T10 + cafe."],
      ["kimngan", "Nhận được rồi nha ✅ Ngân cập nhật sổ quỹ rồi. Cảm ơn Thu 🥰", { react: { "🎉": ["thu"] } }],
      ["kimngan", "Tiện thể: sổ quỹ đang dư khoảng 300.000đ, Ngân định dùng cho buổi liên hoan nhỏ sau khi demo xong. Thu thấy sao?"],
      ["thu", "Hay đó, mình ủng hộ. Để mình đưa vào cuộc họp tuần sau cho mọi người cùng chốt nhé."],
      ["kimngan", "Ok ok. Ngân sẽ ghi vào biên bản. Đừng quên nha, không là ly cà phê tiếp theo của Thu biến thành ly nước lọc đó 😆", { react: { "😂": ["thu"] } }],
    ],
  },

  // 6. baotram — lịch thi, poll học nhóm, xin đề cương
  {
    peer: "baotram",
    lines: [
      ["baotram", "Thu ơi, lịch thi giữa kỳ Toán cao cấp có rồi nha: thứ Hai 13/10, 7h30, phòng B204. Mình đã báo trong nhóm lớp rồi."],
      ["thu", "Cảm ơn Trâm! Còn đúng 10 ngày thôi à... mình phải ôn gấp rồi 😵"],
      ["baotram", "Nên mình định tổ chức học nhóm hai buổi: thứ Tư và thứ Bảy tuần này. Mình sẽ tạo poll trong nhóm để mọi người chọn giờ, Thu vote giúp mình nhé."],
      ["thu", "Ok, mình vote ngay. Để mình hỏi thư viện xem còn phòng học nhóm không."],
      ["baotram", "Tuyệt vời, nhờ Thu nhé. Chiều thứ Bảy phòng hay hết sớm, đặt trước là chắc ăn nhất."],
      ["thu", "Rồi, mình đặt thử luôn hôm nay. À Trâm ơi, Trâm có file đề cương ôn tập thầy Hùng gửi không? Mình chưa thấy trong nhóm."],
      ["baotram", "Có nè. Đề cương giữa kỳ gồm 4 chương đầu: giới hạn và liên tục, đạo hàm, ứng dụng của đạo hàm, tích phân bất định. Mình đã gửi file PDF vào kênh tài liệu của nhóm Toán rồi, nhớ tải về nhé.", { reply: 5 }],
      ["thu", "Mình thấy rồi, cảm ơn Trâm nhiều. Đề cương này có đáp án luôn không?"],
      ["baotram", "Chỉ có đáp án cuối thôi, lời giải từng bước thì Kiên đang soạn, chắc cuối tuần là có."],
      ["thu", "Tuyệt. Vậy mình vote poll xong sẽ báo Trâm giờ phòng nha."],
      ["baotram", "Ok 👍 cảm ơn Thu", { react: { "🙏": ["thu"] } }],
    ],
  },

  // 7. mentorha — nhận xét Writing Task 2
  {
    peer: "mentorha",
    lines: [
      ["thu", "Dạ em chào cô Hà, em gửi cô bài Writing Task 2 em viết hôm qua ạ. Đề: Some people believe that university students should study subjects that are useful for future jobs rather than subjects they enjoy. To what extent do you agree or disagree? Em cảm ơn cô ạ 🙏"],
      ["mentorha", "Chào em, cô nhận được rồi. Cô đọc xong sẽ nhận xét theo 4 tiêu chí nhé. Overall em đang ở khoảng band 6.0: ý tưởng ổn, nhưng còn vài lỗi nhỏ kéo điểm xuống."],
      ["mentorha", "1) Task Response: em chọn quan điểm rõ ràng (partly agree), rất tốt. Nhưng bài chỉ có 238 từ, thiếu so với yêu cầu tối thiểu 250 từ nên sẽ bị trừ điểm. Em nên nhắm 270–290 từ cho an toàn."],
      ["mentorha", "2) Coherence & Cohesion: Body 1 chưa có topic sentence rõ ràng. Em thử mở đoạn bằng câu kiểu 'One compelling reason to prioritise practical subjects is that they improve graduates' employability.' rồi mới đưa ví dụ. Đừng lạm dụng 'Firstly / Secondly' quá, đọc hơi máy móc."],
      ["thu", "Dạ em hiểu rồi cô. Em hay dùng 'Firstly, Secondly' vì sợ lạc ý ạ. Còn từ vựng với ngữ pháp thì sao hả cô?"],
      ["mentorha", "3) Lexical Resource: em lặp 'important' tới 4 lần. Thay bằng crucial / essential / vital, hoặc paraphrase thành 'play a key role in'. Collocation 'make a good career' nghe chưa tự nhiên, nên dùng 'build a successful career'.", { reply: 4 }],
      ["mentorha", "4) Grammar: lỗi mạo từ — 'the students should study...' nên bỏ 'the' vì em nói chung chung: 'university students should study...'. Câu 'Technology is develop fast' phải là 'Technology is developing rapidly'. Câu kết 'I agree totally' nên là 'I totally agree with this view'."],
      ["thu", "Dạ em thấy mình sai đúng mấy chỗ đó ạ. Em xin sửa câu mở bài: 'Many people argue that university students should choose subjects relevant to employment rather than ones they are passionate about.' Cô thấy được chưa ạ?"],
      ["mentorha", "Very good! Câu này paraphrase đề rất tốt, 'relevant to employment' là collocation chuẩn. Em nhớ giữ quan điểm xuyên suốt: nếu partly agree thì Body 2 nên nhượng bộ một chút, ví dụ 'However, passion also matters because...'.", { react: { "🙌": ["thu"] } }],
      ["thu", "Dạ em cảm ơn cô. Vậy em viết lại rồi nộp cô bản 2 trước tối Chủ nhật được không ạ?"],
      ["mentorha", "Được em. Sửa xong gửi cô, cô chấm lại theo 4 tiêu chí. Mục tiêu 6.5 thì em chỉ cần sửa mạo từ và nâng cấp từ vựng, em làm được mà 💪 Keep going!"],
      ["thu", "Dạ em cảm ơn cô nhiều ạ ❤️"],
    ],
  },

  // 8. haidang — kế hoạch ôn CTDL&GT, LIS
  {
    peer: "haidang",
    unreadForThu: 3,
    lines: [
      ["haidang", "Thu ơi, mình lập kế hoạch ôn CTDL&GT cho kỳ thi 24/10, bạn xem rồi góp ý nhé. Tuần này: mảng, chuỗi, stack, queue, danh sách liên kết. Tuần sau: cây (BST, AVL), đồ thị (BFS, DFS, Dijkstra). Tuần cuối: sắp xếp, quy hoạch động và làm đề cũ."],
      ["thu", "Kế hoạch gọn mà đủ ý quá Đăng 😮 Chỉ là mình thấy tuần sau hơi nặng, cây với đồ thị cùng lúc."],
      ["haidang", "Ừ nên mình tách: 3 ngày cho cây, 3 ngày cho đồ thị, 1 ngày bài tập tổng hợp. Mỗi ngày làm 2 bài trên https://leetcode.com là đủ.", { reply: 1 }],
      ["thu", "Ok mình theo. Cho mình hỏi bài Longest Increasing Subsequence nhé: mình làm dp[i] = max(dp[j] + 1) với mọi j < i mà a[j] < a[i], hai vòng for, vậy độ phức tạp là O(n²) đúng không?"],
      ["haidang", "Đúng, thời gian O(n²), bộ nhớ O(n) cho mảng dp. Cách đó đủ để qua đề thi trường, nhưng nếu n cỡ 10⁵ thì sẽ chậm."],
      ["thu", "Vậy có cách nào nhanh hơn không?"],
      ["haidang", "Có: dùng mảng tails, tails[k] = giá trị nhỏ nhất có thể làm đuôi của một dãy con tăng độ dài k+1. Với mỗi phần tử x, dùng binary search tìm vị trí đầu tiên có tails ≥ x rồi ghi đè (nếu không có thì thêm vào cuối). Độ dài tails chính là đáp án. Thời gian O(n log n), bộ nhớ O(n).", { reply: 5, react: { "🤯": ["thu"] } }],
      ["thu", "À mình hiểu rồi, tails không phải dãy con thật mà chỉ giữ đúng độ dài thôi hả?"],
      ["haidang", "Chuẩn! tails chỉ đúng về độ dài, nếu cần in ra dãy thật thì phải lưu thêm vị trí phần tử trước. Câu này thầy hay hỏi, nhớ nói rõ chỗ này."],
      ["thu", "Cảm ơn Đăng, mình ghi lại luôn. Tối nay mình thử code lại bằng binary search xem sao."],
      ["haidang", "Ok, làm xong gửi mình xem thử, mình có bộ test khoảng 20 case."],
      ["haidang", "Nhớ test dãy toàn giá trị bằng nhau (kết quả = 1) và dãy giảm dần nữa, hai case đó hay sai nhất."],
      ["haidang", "À, nếu đề yêu cầu dãy không giảm (≤) thì đổi sang tìm vị trí đầu tiên có tails > x (upper bound) nhé."],
    ],
  },

  // 9. mentortuan — lời khuyên kiến trúc app
  {
    peer: "mentortuan",
    lines: [
      ["thu", "Anh Tuấn ơi, em xin lời khuyên về kiến trúc app Tiêu Gọn ạ. Hiện em chia thư mục theo loại: screens/, components/, hooks/, utils/. Màn càng nhiều thì càng khó tìm file anh ạ."],
      ["mentortuan", "Chào em. Đó là dấu hiệu nên chuyển sang chia theo tính năng (feature-based). Ví dụ: src/features/expenses, src/features/reports, src/features/auth. Mỗi feature có screens, components, hooks, api riêng."],
      ["mentortuan", "Phần dùng chung (Button, Input, theme, http client) để ở src/shared. Quy tắc: feature chỉ import từ shared, không import chéo sang feature khác. Nếu hai feature cùng cần thì đẩy phần đó xuống shared."],
      ["thu", "Dạ em hiểu. Còn state thì em đang dùng Context cho gần như mọi thứ, danh sách giao dịch cũng để trong Context, mỗi lần thêm là cả cây render lại ạ."],
      ["mentortuan", "Đó là lý do. Anh đề xuất tách làm 2 loại: (1) server state (giao dịch, danh mục, báo cáo) dùng TanStack Query, có cache, refetch, optimistic update; (2) client state nhẹ (bộ lọc, theme, trạng thái UI) dùng Zustand hoặc Context nhỏ.", { reply: 3 }],
      ["thu", "Dạ vậy có cần Redux không anh?"],
      ["mentortuan", "Không cần. App của em chưa đủ phức tạp, Redux thêm boilerplate không đáng. Nguyên tắc: state đặt gần nơi dùng nhất có thể, chỉ nâng lên cao khi thật sự cần."],
      ["thu", "Dạ em hiểu. Em định làm tính năng nhập chi tiêu offline khi mất mạng, có ảnh hưởng gì đến kiến trúc không anh?"],
      ["mentortuan", "Có, nên tính từ giờ. TanStack Query có thể persist cache xuống AsyncStorage và giữ hàng đợi mutation khi offline. Nhưng đừng làm sớm: demo cuối tháng chỉ cần luồng chính chạy mượt là đủ. Ghi vào backlog, làm sau.", { react: { "👍": ["thu"] } }],
      ["thu", "Dạ em sẽ ưu tiên luồng chính trước. Em cảm ơn anh, em sẽ họp nhóm để thống nhất cấu trúc mới."],
      ["mentortuan", "Ừ. Anh gợi ý refactor từng feature một, mỗi PR một feature, đừng gom hết một lần. Xong PR nào ping anh review. Chúc nhóm demo tốt 👍"],
      ["thu", "Dạ em cảm ơn anh Tuấn ạ 🙏"],
    ],
  },
];

export const groupChats: GroupChatSpec[] = [
  // Stand-up appdev
  {
    workspace: "appdev",
    title: "Daily stand-up Tiêu Gọn",
    owner: "quocbao",
    members: ["thu", "minhanh", "hoanglong", "thuytrang", "giahuy"],
    unreadForThu: 3,
    lines: [
      ["quocbao", "Stand-up thứ Sáu nhé. Mỗi người: hôm qua làm gì / hôm nay làm gì / vướng gì. Ngắn gọn thôi."],
      ["minhanh", "Hôm qua: xong màn Thống kê (biểu đồ cột theo tháng), đã tách component. Hôm nay: viết xử lý bộ lọc theo danh mục. Vướng: chưa có API trả tổng theo danh mục."],
      ["quocbao", "Endpoint /reports/by-category mình xong rồi, đang ở nhánh dev. Chiều nay deploy staging.", { reply: 1 }],
      ["minhanh", "Tuyệt, cảm ơn Bảo 🙏", { react: { "👍": ["quocbao", "thu"] } }],
      ["hoanglong", "Hôm qua: làm màn Thêm chi tiêu trên Android, chạy ok. Hôm nay: sang test iOS. Vướng: bàn phím che mất ô nhập số tiền trên iPhone nhỏ haha, đang chỉnh KeyboardAvoidingView."],
      ["giahuy", "Hôm qua: viết Dockerfile + docker-compose cho BE. Hôm nay: cấu hình CI chạy lint và build. Vướng: không, trừ việc container Mongo của mình tự restart lúc 3h sáng 🙃", { react: { "😂": ["hoanglong", "minhanh"] } }],
      ["thuytrang", "Hôm qua: xong bản Home v3 trên Figma 🎨 Hôm nay: làm dark mode + icon danh mục. Vướng: cần {@hoanglong} xác nhận dùng bộ icon nào để mình xuất đúng kích thước ạ 🌸"],
      ["hoanglong", "Mình dùng react-native-svg, Trang xuất SVG 24x24 là import được liền nha.", { reply: 6 }],
      ["thu", "Hôm qua: họp mentor, gửi lại spec auth cho Bảo. Hôm nay: tổng hợp góp ý Home, tạo Meet critique Chủ nhật 20h. Vướng: không ạ. Nhắc cả nhóm: demo cuối tháng, tuần sau mình chốt phạm vi nhé.", { react: { "📌": ["quocbao"] } }],
      ["quocbao", "Của mình: hôm qua chuẩn hoá response API + mã lỗi TOKEN_EXPIRED; hôm nay deploy staging + viết docs endpoint. Không vướng."],
      ["giahuy", "Staging deploy xong ping mình nhé, mình trỏ domain test vào luôn 😎"],
      ["minhanh", "Chốt: cuối ngày ai cũng cập nhật thẻ trên bảng Kanban của nhóm nha 📌"],
    ],
  },

  // Team React tối thứ 5 (frontend)
  {
    workspace: "frontend",
    title: "Team React tối thứ 5",
    owner: "thu",
    members: ["minhanh", "ducanh", "hoanglong", "vietdung", "khanhlinh"],
    lines: [
      ["thu", "Mọi người ơi, mình hẹn học nhóm React tối thứ 5 tuần này (9/10) lúc 20h trên Google Meet nhé. Chủ đề chính: tối ưu re-render. Ai rảnh thả 👍 giúp mình.", { react: { "👍": ["minhanh", "hoanglong", "vietdung", "khanhlinh", "ducanh"] } }],
      ["ducanh", "Mình đi ạ! Cho mình hỏi re-render là gì mà phải tối ưu vậy? Mình thấy component render lại cũng có sao đâu 😅"],
      ["minhanh", "Render lại ko có gì sai, nhưng nếu component nặng hoặc render hàng trăm lần thì UI sẽ giật. Hay gặp nhất: cha render thì con render theo dù props không đổi.", { reply: 1 }],
      ["vietdung", "Kinh nghiệm đi làm của mình: đừng tối ưu sớm. Đo trước bằng React DevTools Profiler, thấy component nào render nhiều hoặc tốn thời gian rồi mới xử lý."],
      ["ducanh", "Vậy xử lý bằng cách nào ạ? Cho mình xin ví dụ với 🙏"],
      ["minhanh", "Ba công cụ chính: React.memo bọc component con; useMemo cho giá trị tính toán nặng; useCallback cho hàm truyền xuống con (để props hàm không đổi tham chiếu). Mình sẽ demo trong buổi."],
      ["khanhlinh", "Mình tổng hợp nhanh vào Docs nhóm nhé: (1) đo bằng Profiler (2) React.memo (3) useMemo / useCallback (4) key ổn định trong list (5) chia nhỏ state. Tài liệu gốc: https://react.dev", { react: { "🙏": ["thu", "ducanh"] } }],
      ["hoanglong", "Thêm một điểm nữa: đừng bọc memo bừa bãi haha, vì memo cũng tốn chi phí so sánh props. Chỉ dùng cho component con nặng hoặc render nhiều lần thôi."],
      ["thu", "Hay quá. Vậy tối thứ 5: Minh Anh giới thiệu Profiler khoảng 15 phút, sau đó cả nhóm thử tối ưu cùng một repo ví dụ. Mình sẽ tạo repo + gửi link Meet trước 19h hôm đó."],
      ["minhanh", "Ok, mình chuẩn bị sẵn đoạn code có list 1000 item để demo.", { react: { "👍": ["thu"] } }],
      ["ducanh", "Cảm ơn cả team nhiều 🥹 mình sẽ cài sẵn React DevTools."],
      ["thu", "Bạn nào bận thì báo mình nhé, mình sẽ ghi chú lại gửi sau cho mọi người."],
    ],
  },

  // Ôn thi giữa kỳ — nhóm toán
  {
    workspace: "math",
    title: "Ôn thi giữa kỳ — nhóm 5 người",
    owner: "baotram",
    members: ["thu", "trungkien", "myhanh", "nhatminh", "hieutrung"],
    unreadForThu: 1,
    lines: [
      ["baotram", "Cả nhóm ơi, thi giữa kỳ Toán cao cấp là thứ Hai 13/10 nha. Mình chia chương, mỗi người tổng hợp công thức + 3 bài mẫu: Chương 1 giới hạn–liên tục: {@myhanh}; Chương 2 đạo hàm: {@nhatminh}; Chương 3 ứng dụng đạo hàm: {@hieutrung}; Chương 4 tích phân: {@trungkien}. Thu với mình rà soát tổng hợp.", { pin: true }],
      ["hieutrung", "Sao mình lại dính chương 3 😭 Chương ứng dụng đạo hàm mà dính mình thì cả nhóm chuẩn bị tinh thần đi haha"],
      ["trungkien", "Yên tâm, chương 3 cũng chỉ xoay quanh cực trị, tính lồi lõm, tiệm cận. Mình sẽ gửi dàn ý các bước giải để bạn làm theo.", { reply: 1 }],
      ["myhanh", "Mình nhận chương 1 ạ. Cho mình hỏi: lim sin x / x khi x → 0 bằng 1, thì chứng minh bằng định lý nào vậy mọi người?"],
      ["trungkien", "Dùng định lý kẹp: với 0 < x < π/2 có sin x < x < tan x. Chia cho sin x được 1 < x/sin x < 1/cos x, cho x → 0 thì 1/cos x → 1 nên x/sin x → 1, suy ra sin x / x → 1.", { reply: 3, react: { "🤩": ["myhanh", "nhatminh"] } }],
      ["myhanh", "À hiểu rồi, cảm ơn Kiên nhiều 🥹"],
      ["nhatminh", "Mình làm thử đề năm ngoái thì kẹt câu này: tính ∫ x·eˣ dx. Mình đặt u = eˣ rồi tính lung tung mãi."],
      ["trungkien", "Tích phân từng phần nhé: đặt u = x, dv = eˣ dx → du = dx, v = eˣ. Khi đó ∫ x·eˣ dx = x·eˣ − ∫ eˣ dx = x·eˣ − eˣ + C = eˣ(x − 1) + C. Chọn u là phần mà đạo hàm làm nó đơn giản đi.", { reply: 6 }],
      ["nhatminh", "Ra rồi! Mình cứ đặt ngược nên càng làm càng rối 😅", { react: { "👏": ["trungkien", "baotram"] } }],
      ["hieutrung", "Mình có lời tiên tri: sau kỳ thi cả nhóm đi ăn lẩu, bất kể điểm gì. Và người trả tiền là người thấp điểm nhất haha 🍲"],
      ["baotram", "Ý tưởng hay, nhưng Hiếu Trung nhớ mang ví nha 😂 Lẩu lúc nào cũng được, giờ tập trung ôn đã.", { react: { "😂": ["thu", "nhatminh", "myhanh"] } }],
      ["thu", "Mình sẽ gom thành một file PDF tổng hợp công thức chung, mọi người gửi phần của mình cho mình trước tối thứ Bảy nhé. Học nhóm thứ Tư / thứ Bảy đang chờ poll của Trâm."],
      ["baotram", "Poll giờ học nhóm mình đã tạo trong nhóm rồi, mọi người nhớ vote trước tối nay nha 🗳️"],
    ],
  },

  // Họp đồ án — khẩn (capstone)
  {
    workspace: "capstone",
    title: "Họp đồ án — khẩn",
    owner: "ngocdiep",
    members: ["thu", "phuocloi", "ngoclan", "phuongthao"],
    lines: [
      ["ngocdiep", "KHẨN: khoa vừa gửi lịch bảo vệ. Nhóm mình bảo vệ thứ Năm 16/10, 9h00, phòng C201. Trình bày 15 phút + hỏi đáp 10 phút. Mọi người xác nhận giúp mình ạ.", { pin: true, edited: true, react: { "✅": ["thu", "phuocloi", "ngoclan", "phuongthao"] } }],
      ["phuocloi", "Mình xác nhận ✅ Lợi ok 9h thứ Năm."],
      ["ngoclan", "Lan ok. Slide mình xong 18/22 trang, còn phần demo với kết luận."],
      ["phuongthao", "Mình cũng ok. Cho mình hỏi demo trực tiếp hay quay video dự phòng ạ? Nhỡ mạng phòng đó chập chờn thì toang á."],
      ["ngocdiep", "Ý hay đấy Thảo. Demo trực tiếp là chính, nhưng quay video dự phòng 3–4 phút để lỡ có sự cố còn có cái chiếu. Thảo quay được không?", { reply: 3 }],
      ["phuongthao", "Được ạ, mình quay sau khi chốt kịch bản demo."],
      ["ngocdiep", "Phân công demo: Lợi — nghiệp vụ mượn/trả + phần CSDL; {@thu} — giao diện, tìm kiếm sách và trang thống kê; Thảo — dữ liệu mẫu, kịch bản kiểm thử, quay video dự phòng; Lan — dẫn slide; mình mở đầu và kết luận."],
      ["thu", "Dạ mình nhận phần giao diện + thống kê. Mình sẽ viết kịch bản demo 5 phút, gửi nhóm trước thứ Hai nhé.", { react: { "👍": ["ngocdiep"] } }],
      ["phuocloi", "Mình sẽ đổ dữ liệu mẫu 200 đầu sách + 50 bạn đọc lên server demo cho chắc, Thảo cứ dùng bộ đó để test."],
      ["phuongthao", "Ok Lợi. Mình đã thấy 2 lỗi nhỏ ở trang trả sách, lát mình tạo issue gửi lại nhé.", { react: { "🔍": ["ngocdiep"] } }],
      ["ngoclan", "Nhắc in báo cáo: cần 5 quyển (3 cho hội đồng, 1 cho giáo viên hướng dẫn, 1 lưu khoa), nộp trước 15/10. Mình sẽ đặt in vào Chủ nhật 12/10, ai còn chỉnh báo cáo xin chốt bản cuối trước đó nhé."],
      ["ngocdiep", "Chốt: bản báo cáo cuối nộp cho Lan trước 20h thứ Bảy 11/10. Tập duyệt cả nhóm: thứ Ba 14/10, 20h, Google Meet, mọi người dùng đúng thiết bị sẽ demo."],
      ["thu", "Mình nhớ rồi ạ. Phần chương 3 mình gửi bản nháp trước tối Chủ nhật 5/10."],
      ["phuongthao", "Chốt! Cố lên cả nhóm 💪", { react: { "💪": ["ngocdiep", "thu", "phuocloi", "ngoclan"] } }],
    ],
  },
];
