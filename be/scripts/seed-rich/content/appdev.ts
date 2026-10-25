import type { WorkspaceSpec } from "../types";

export const spec: WorkspaceSpec = {
  key: "appdev",
  name: "Nhóm xây dựng dự án ứng dụng",
  description:
    "Nhóm làm dự án app di động “Tiêu Gọn” — quản lý chi tiêu cho sinh viên. App dùng React Native + Expo, backend Node.js/Express + MongoDB.",
  cover: "violet",
  owner: "thu",
  admins: ["quocbao", "mentortuan"],
  members: [
    "minhanh",
    "hoanglong",
    "thuytrang",
    "giahuy",
    "phuongthao",
    "duyhung",
    "thuhien",
    "kimngan",
    "vietdung",
    "thanhtung",
  ],
  channels: [
    {
      name: "Chung",
      description: "Thông báo chung, quy ước và lịch họp của nhóm",
      followers: "all",
      unreadForThu: 3,
      lines: [
        [
          "thu",
          "Chào cả nhà 👋 Mình pin lại vài quy ước nhóm cho dự án Tiêu Gọn nhé:\n(1) Task nào cũng lên bảng Đồ án 1\n(2) PR cần ít nhất 1 người review trước khi merge\n(3) Họp nhanh 15 phút vào tối Thứ 3 và Thứ 6.\nAi thấy chưa ổn thì cứ góp ý ạ.",
          { pin: true, react: { "👍": ["minhanh", "quocbao", "hoanglong", "thuhien", "kimngan"] } },
        ],
        ["quocbao", "Ok. Branch đặt theo dạng feat/<tên-ngắn>, fix/<tên-ngắn> cho dễ nhìn nhé."],
        [
          "mentortuan",
          "Thêm một điều nữa: commit message theo kiểu Conventional Commits (feat:, fix:, chore:...). Sau này sinh changelog dễ hơn nhiều. Tuần sau anh sẽ review thử vài PR đầu tiên.",
        ],
        [
          "hoanglong",
          "Conventional Commits haha, nghe sang ghê. Em quen viết “sửa lỗi lần 3” rồi anh ơi 😂",
          { reply: 2, react: { "😂": ["giahuy", "thuytrang", "phuongthao"] } },
        ],
        [
          "giahuy",
          "Đừng lo, mình cài commitlint + husky là hết đường viết bậy 😈 Để mình làm luôn trong repo.",
          { react: { "🔥": ["mentortuan", "quocbao"] } },
        ],
        [
          "minhanh",
          "Mình ủng hộ. Với PR, mình đề xuất có template gồm 3 mục: Mô tả / Cách test / Ảnh chụp màn hình. Review sẽ nhanh hơn nhiều.",
        ],
        [
          "thu",
          "Hay quá, mình thêm PR template vào repo luôn nhé. Cảm ơn {@giahuy} và {@minhanh} nha!",
          { reply: 5 },
        ],
        [
          "thu",
          "Buổi họp review dài 1 tiếng cuối tuần này mọi người tiện giờ nào nhất ạ?",
          {
            poll: {
              options: ["Tối Thứ 6 (20h)", "Sáng Thứ 7 (9h)", "Chiều Chủ nhật (15h)"],
              votes: [
                ["minhanh", "quocbao", "phuongthao", "kimngan"],
                ["thu", "hoanglong", "thuytrang", "duyhung", "thuhien"],
                ["giahuy", "vietdung", "thanhtung"],
              ],
              closesInDays: 2,
            },
          },
        ],
        [
          "vietdung",
          "Mình nghĩ nên chốt luôn “Definition of Done” cho mỗi task: code xong + có test cơ bản + được review + chạy được trên cả Android lẫn iOS. Đỡ cãi nhau sau này 😅",
        ],
        ["mentortuan", "Ý hay đấy {@vietdung}. {@thu} em đưa vào mô tả bảng luôn nhé.", { reply: 8 }],
        ["thu", "Dạ vâng anh, em ghi vào mô tả bảng ngay ạ.", { edited: true }],
        [
          "thuhien",
          "Mình vừa tạo thư mục Drive chung cho tài liệu + slide, link nằm trong kênh Báo cáo & Slide nha.",
        ],
        [
          "kimngan",
          "Nhắc nhẹ: quỹ nhóm tháng này mỗi bạn 50k nhé, mình ghi rõ trong mục quỹ nhóm. Ai chưa đóng thì chuyển giúp mình ạ 🙏",
          { react: { "🙏": ["thu", "giahuy"] } },
        ],
        ["phuongthao", "Mình xin phép làm tester cho cả nhóm nhé, có lỗi gì mình ghi vào bảng với nhãn Bug 🐞"],
        ["minhanh", "Hoan nghênh {@phuongthao} 🙌 Có tester từ sớm là yên tâm hẳn.", { reply: 13 }],
        ["duyhung", "Mình vừa chuyển từ Java sang Node nên có gì sai sót về Express mọi người chỉ giúp mình nhé 😅"],
      ],
    },
    {
      name: "Dự án",
      description: "Phạm vi, kiến trúc và quyết định chung của dự án Tiêu Gọn",
      lines: [
        [
          "thu",
          "Mình tóm tắt phạm vi MVP của Tiêu Gọn để cả nhóm cùng nhìn một hướng nhé: đăng nhập, ghi khoản thu/chi, phân loại, thống kê theo tuần, nhắc ghi chép mỗi tối. Mấy thứ như chia tiền nhóm, quét hoá đơn để vòng sau ạ.",
          { pin: true, react: { "👍": ["minhanh", "hoanglong", "quocbao", "thuytrang", "mentortuan"] } },
        ],
        [
          "mentortuan",
          "Phạm vi vậy là vừa sức rồi. Anh gợi ý ưu tiên luồng “thêm khoản chi trong 3 chạm” — sinh viên lười ghi chép lắm, ghi mất quá 10 giây là bỏ app.",
        ],
        [
          "thuytrang",
          "Đồng ý với anh Tuấn ạ 💜 Em đang vẽ màn Thêm khoản chi: nhập số tiền trước, chọn danh mục bằng icon to, ngày mặc định là hôm nay. Xong sẽ gửi Figma cho mọi người xem nha ✨",
          { reply: 1 },
        ],
        ["hoanglong", "Số tiền nhập trước thì dùng bàn phím số luôn nha, đỡ phải bấm đổi bàn phím haha"],
        [
          "minhanh",
          "Mình đề xuất chốt kiểu dữ liệu chung: Transaction { id, amount, type: ‘expense’ | ‘income’, category, note, date }. Mobile và backend cùng bám theo để khỏi lệch.",
          {
            thread: [
              [
                "mentortuan",
                "Nhớ thêm field currency mặc định “VND” để sau này mở rộng, nhưng đừng làm đa tiền tệ ở MVP nhé.",
              ],
              ["minhanh", "Dạ, em thêm currency: ‘VND’ vào interface và để mặc định ạ."],
              ["quocbao", "Backend đặt default trong schema luôn."],
            ],
          },
        ],
        [
          "quocbao",
          "Backend sẽ khớp: amount lưu số nguyên (VND), date lưu ISO UTC. Thêm userId + createdAt/updatedAt.",
          { reply: 4 },
        ],
        [
          "duyhung",
          "Có cần trường deletedAt cho xoá mềm không? Bên Java mình quen làm vậy cho dễ đồng bộ.",
        ],
        [
          "quocbao",
          "Cần, mobile offline sẽ cần biết khoản nào đã bị xoá khi sync. Thêm deletedAt nhé.",
          { reply: 6 },
        ],
        [
          "giahuy",
          "Mình dựng sẵn docker-compose cho Mongo + API, ai clone về chạy 1 lệnh là có môi trường local. Mốc: tối nay.",
          { react: { "🚀": ["thu", "quocbao", "duyhung"] } },
        ],
        ["thu", "Tuyệt quá {@giahuy}! Mình sẽ thêm vào README phần hướng dẫn chạy dự án."],
        [
          "phuongthao",
          "Mình hỏi chút: khoản chi lưu âm hay dương trong DB vậy? Nếu có type riêng rồi thì amount luôn dương cho khỏi nhầm khi tính tổng nhé.",
        ],
        [
          "minhanh",
          "Đúng ạ, amount luôn dương, dấu do type quyết định. Mình sẽ ghi vào tài liệu.",
          { reply: 10, react: { "👍": ["phuongthao", "quocbao"] } },
        ],
        [
          "vietdung",
          "Nhớ ghi chú thêm: tiền VND không có phần thập phân nên không cần lo lỗi làm tròn số thực như bên ngoại tệ.",
        ],
      ],
    },
    {
      name: "Thiết kế UI",
      description: "Wireframe, Figma, bảng màu và icon của app",
      lines: [
        [
          "thuytrang",
          "Mọi người ơi, bản Figma v1 đã xong 🎨 Gồm: Đăng nhập, Trang chủ (tổng chi hôm nay + danh sách), Thêm khoản chi, Thống kê tuần. Mọi người vào https://www.figma.com mở file nhóm rồi góp ý trực tiếp giúp mình nha 💕",
          { pin: true, react: { "😍": ["thu", "minhanh", "hoanglong", "thuhien"] } },
        ],
        [
          "thu",
          "Đẹp quá Trang ơi 😍 Mình thích tông tím nhạt với xanh mint. Mình sẽ xem kỹ rồi comment trực tiếp trên Figma nhé.",
          { reply: 0 },
        ],
        [
          "thanhtung",
          "Mình làm animation nhỏ cho nút “+” và hiệu ứng số tiền nhảy khi cộng dồn được không? Dùng Reanimated chạy mượt 60fps luôn.",
        ],
        [
          "hoanglong",
          "Cho phép đi, miễn là đừng làm app giật trên máy cấu hình thấp 😅 Em test trên cái Redmi cũ của em được.",
          { reply: 2 },
        ],
        ["thuytrang", "Ok Tùng, nhưng giữ animation dưới 300ms nha, đừng chói mắt 🥺", { reply: 2 }],
        [
          "minhanh",
          "Về dark mode: bạn Trang cho mình bảng màu token (background, surface, text, primary...) cho cả 2 theme nhé. Mình khai báo thành theme object một lần là dùng chung được.",
        ],
        [
          "thuytrang",
          "Có luôn nè: background #FFFFFF / #121212, surface #F5F3FF / #1E1B2E, primary #7C5CFC. Mình sẽ cập nhật vào phần Styles trong file Figma.",
          {
            reply: 5,
            thread: [
              [
                "vietdung",
                "Mình thử check màu primary #7C5CFC trên nền trắng: tương phản khoảng 4.4:1, hơi thấp hơn ngưỡng 4.5:1 của WCAG AA cho chữ nhỏ. Nút to, chữ đậm thì ổn; còn link/chữ nhỏ nên dùng tông đậm hơn.",
              ],
              ["thuytrang", "Ôi cảm ơn Dũng đã soi 🥹 Mình sẽ làm thêm một tông primary đậm hơn cho chữ nhỏ, vẫn giữ tông tím nha."],
              ["minhanh", "Mình thêm token primaryText trong theme cho trường hợp này."],
              [
                "phuongthao",
                "Mình sẽ test cả dark mode lẫn light mode ở cỡ chữ lớn của hệ thống (accessibility font size) nữa nhé.",
              ],
            ],
          },
        ],
        [
          "thuhien",
          "Mình làm giúp bộ icon danh mục cho đồng bộ (ăn uống, đi lại, học tập, giải trí, khác) được không Trang? Mình vẽ cùng nét 2px bo tròn ạ.",
        ],
        ["thuytrang", "Được luôn Hiền ơi 🥰 Nét 2px bo tròn là chuẩn đẹp rồi.", { reply: 7 }],
        [
          "mentortuan",
          "Anh góp ý nhỏ: màn Thống kê đừng nhồi quá nhiều biểu đồ. Một biểu đồ cột theo ngày trong tuần + danh sách top danh mục là đủ cho MVP.",
          { react: { "👍": ["thu", "thuytrang", "minhanh"] } },
        ],
        [
          "thu",
          "Dạ, mình chốt theo ý anh Tuấn nhé mọi người. {@thuytrang} Trang giản lược màn Thống kê giúp mình ạ.",
          { reply: 9 },
        ],
        ["thuytrang", "Ok ạ, tối nay mình sửa xong và báo ở đây 💜"],
      ],
    },
    {
      name: "Backend API",
      description: "Thiết kế API, MongoDB, bảo mật và triển khai staging",
      unreadForThu: 2,
      lines: [
        [
          "quocbao",
          "Mình chốt cấu trúc API v1 (prefix /api/v1), mọi người xem giúp:\nPOST /auth/register, /auth/login, /auth/refresh\nGET, POST /transactions\nGET, PATCH, DELETE /transactions/:id\nGET /stats/weekly\nMọi response đều có dạng { data, error }.",
          { pin: true, react: { "👍": ["minhanh", "duyhung", "mentortuan"] } },
        ],
        [
          "duyhung",
          "Cho mình hỏi phân trang cho GET /transactions: dùng page/limit hay cursor? Bên Spring mình quen Pageable nên hơi bỡ ngỡ chỗ này.",
        ],
        [
          "mentortuan",
          "Với danh sách cuộn vô hạn trên mobile thì cursor-based tốt hơn: không bị trùng/sót bản ghi khi có khoản mới chèn vào giữa lúc đang cuộn. Cursor có thể là cặp (date, _id).",
          { reply: 1 },
        ],
        [
          "quocbao",
          "Chốt cursor nha. Mình trả nextCursor trong response; hết dữ liệu thì nextCursor = null. Index (userId, date, _id) mình tạo luôn.",
          { reply: 2, edited: true },
        ],
        [
          "giahuy",
          "Staging mình định dựng trên Render (gói free) + MongoDB Atlas M0. Free tier sẽ ngủ khi lâu không có request nên lần gọi đầu hơi chậm, mọi người thông cảm nha 😴",
          { react: { "👍": ["thu", "quocbao"] } },
        ],
        [
          "minhanh",
          "Phía mobile cần endpoint tạo khoản chi nhận thêm clientId (UUID do app sinh) để sync offline không bị tạo trùng khi retry. Backend hỗ trợ được không {@quocbao}?",
        ],
        [
          "quocbao",
          "Được. Mình đặt unique index (userId, clientId); gửi lại cùng clientId thì trả về bản ghi cũ (idempotent), không tạo mới.",
          {
            reply: 5,
            thread: [
              [
                "duyhung",
                "Nếu 2 request cùng clientId tới gần như đồng thời thì sao? Có thể cả 2 đều qua bước kiểm tra trước khi insert.",
              ],
              [
                "quocbao",
                "Nên đừng kiểm tra rồi mới insert. Cứ insert, nếu dính lỗi duplicate key (code 11000) thì tìm lại bản ghi cũ và trả về. Unique index lo phần chặn.",
              ],
              [
                "mentortuan",
                "Đúng hướng. Dùng findOneAndUpdate với upsert + $setOnInsert cũng được, nhưng cách bắt 11000 dễ đọc hơn cho cả team.",
              ],
              ["duyhung", "Hiểu rồi, mình sẽ viết theo cách bắt lỗi 11000."],
            ],
          },
        ],
        [
          "phuongthao",
          "Mình test thử POST /transactions bằng Postman: gửi amount âm vẫn nhận 201, gửi category rỗng cũng nhận. Cần validate nha {@duyhung} 🐞",
          { react: { "🙏": ["duyhung"] } },
        ],
        [
          "duyhung",
          "Dạ mình đang thêm zod: amount phải là số nguyên > 0, category thuộc danh sách cho phép, note tối đa 200 ký tự. Chiều nay xong ạ.",
          { reply: 7 },
        ],
        ["quocbao", "Zod ổn. Nhớ thêm helmet, cors giới hạn origin và express-rate-limit cho /auth/* nữa."],
        [
          "mentortuan",
          "Mật khẩu hash bằng bcrypt (cost ≥ 10) hoặc argon2, access token sống ngắn (15 phút), refresh token xoay vòng và lưu bản hash trong DB. Đừng lưu token dạng plain.",
        ],
        ["thu", "Cảm ơn các anh/bạn nhiều ạ 🙏 Mình sẽ tạo thẻ riêng cho phần bảo mật auth trên bảng để theo dõi."],
        [
          "giahuy",
          "Meme của ngày: “It works on my machine” → “Vậy ship cái machine của bạn luôn đi” 🐳😂",
          { react: { "😂": ["hoanglong", "phuongthao", "duyhung"] } },
        ],
        [
          "quocbao",
          "Docs Express cho ai cần: https://expressjs.com — mục Error handling nên đọc trước khi viết middleware lỗi.",
        ],
      ],
    },
    {
      name: "Mobile App",
      description: "App React Native + Expo: cấu trúc, màn hình, offline, biểu đồ",
      unreadForThu: 2,
      lines: [
        [
          "hoanglong",
          "App mobile đã chạy được trên Expo Go rồi các bạn ơi haha 🎉 Cấu trúc: Expo Router, state dùng Zustand, gọi API qua TanStack Query. Mình đẩy lên nhánh feat/app-init, mọi người pull về thử nha.",
          { pin: true, react: { "🎉": ["thu", "minhanh", "quocbao", "thuytrang"] } },
        ],
        ["thu", "Tuyệt vời Long ơi 🎉 Mình chạy thử rồi, mở lên được ngay. Cảm ơn bạn nhiều!", { reply: 0 }],
        [
          "minhanh",
          "Mình xem cấu trúc thư mục: app/ (routes), src/components, src/hooks, src/api, src/store. Mình đề xuất thêm src/theme chứa token màu cho light/dark. Ok không Long?",
          { reply: 0 },
        ],
        ["hoanglong", "Ok luôn {@minhanh} ✌️", { reply: 2 }],
        [
          "vietdung",
          "Lưu ý token đăng nhập: đừng lưu bằng AsyncStorage vì nó không mã hoá. Dùng expo-secure-store (Keychain trên iOS, Keystore trên Android) nhé.",
          { react: { "👍": ["mentortuan", "hoanglong"] } },
        ],
        [
          "hoanglong",
          "Dạ đúng, em dùng expo-secure-store cho refresh token. Còn danh sách khoản chi cache bằng AsyncStorage vì cần đọc nhanh.",
          { reply: 4 },
        ],
        [
          "thanhtung",
          "Mọi người chọn thư viện nào cho biểu đồ cột thống kê tuần? Mình thấy 3 hướng: tự vẽ bằng react-native-svg, victory-native, hoặc react-native-gifted-charts.",
          {
            poll: {
              options: ["Tự vẽ bằng react-native-svg", "victory-native", "react-native-gifted-charts"],
              votes: [["minhanh"], ["hoanglong", "vietdung", "mentortuan"], ["thanhtung", "thuytrang", "thu"]],
            },
          },
        ],
        [
          "mentortuan",
          "Anh nghiêng về thư viện có sẵn để tiết kiệm thời gian, nhưng nhớ kiểm tra thư viện còn được bảo trì và chạy tốt với Expo SDK hiện tại không. Thử cài vào một nhánh riêng trước khi chốt.",
          { reply: 6 },
        ],
        ["thanhtung", "Ok anh, mình sẽ spike thử mỗi cái 30 phút rồi báo kết quả.", { reply: 7 }],
        [
          "phuongthao",
          "Bug nhỏ ở màn Thêm khoản chi: nhập “1.5” vào số tiền vẫn cho qua, bấm lưu rồi app crash 🐞 Mình đính kèm video lên thẻ rồi nha {@hoanglong}",
          {
            react: { "😱": ["hoanglong"] },
            thread: [
              [
                "hoanglong",
                "Lỗi của em rồi haha. Em định lưu state số tiền dạng string rồi parse khi lưu. Hay lưu luôn number ạ?",
              ],
              [
                "minhanh",
                "Giữ string trong ô nhập, lọc ký tự bằng replace(/\\D/g, ''), khi submit mới chuyển Number. Hiển thị dùng Intl.NumberFormat('vi-VN') ra 1.500.000.",
              ],
              [
                "vietdung",
                "Nếu máy nào hiển thị sai dấu chấm ngăn cách thì tự viết hàm format bằng regex cho chắc, đỡ phụ thuộc môi trường.",
              ],
              ["hoanglong", "Okela, em viết hàm formatVnd riêng cho đỡ lệ thuộc."],
            ],
          },
        ],
        [
          "thuytrang",
          "Mình xem bản chạy thật thấy khoảng cách giữa các thẻ hơi sát, bạn Long tăng padding lên 16 giúp mình nha 🥹",
        ],
        ["hoanglong", "Dạ tăng liền cho Trang 😆", { reply: 10 }],
        [
          "thu",
          "Mình ghi các việc trên vào bảng nhé: biểu đồ tuần (Tùng), sửa nhập số tiền (Long), đồng bộ offline (Long + Minh Anh). Ai muốn đổi thì nói mình ạ.",
        ],
        [
          "minhanh",
          "Offline sync mình đề xuất làm hàng đợi các thao tác (create/update/delete) lưu local, có mạng thì đẩy lên, dùng NetInfo để bắt trạng thái mạng. Xung đột thì last-write-wins theo updatedAt cho MVP.",
        ],
        [
          "mentortuan",
          "Hướng ổn cho MVP. Nhớ gửi clientId + updatedAt trong mỗi thao tác, và cho người dùng thấy trạng thái “chưa đồng bộ” trên từng khoản.",
        ],
      ],
    },
    {
      name: "Báo cáo & Slide",
      description: "Dàn ý báo cáo, khảo sát người dùng, slide và poster demo",
      lines: [
        [
          "thuhien",
          "Mình tạo cấu trúc báo cáo + template slide rồi nhé cả nhà 📑 Slide dùng tông tím như app để đồng bộ nhận diện. Mọi người xem rồi cho ý kiến ạ.",
          { pin: true },
        ],
        [
          "thu",
          "Cảm ơn Hiền ơi. Mình đề xuất báo cáo gồm: Giới thiệu, Khảo sát người dùng, Thiết kế (UI + hệ thống), Triển khai, Kiểm thử, Kết luận. Mỗi phần giao một bạn phụ trách.",
          { reply: 0 },
        ],
        [
          "vietdung",
          "Nên có một phần khảo sát nhanh 20–30 bạn sinh viên về thói quen ghi chép chi tiêu. Có số liệu thật thì thuyết phục hơn nhiều. Mình tạo Google Form được.",
          { reply: 1 },
        ],
        ["thu", "Hay quá Dũng ơi, nhờ bạn tạo giúp mình nhé. Mình sẽ gửi vào các nhóm lớp.", { reply: 2 }],
        ["thuhien", "Mình sẽ làm phần trình bày kết quả khảo sát bằng biểu đồ tròn + cột cho dễ nhìn."],
        [
          "mentortuan",
          "Slide demo nên ít chữ, nhiều ảnh chụp app thật. Đừng quên một slide nêu rõ hạn chế hiện tại và hướng phát triển, hội đồng rất thích nghe điều này.",
        ],
        [
          "kimngan",
          "Phần in poster A3 cho buổi demo thì mình ghi vào chi tiêu nhóm nhé. Ai có xưởng in giá tốt thì chỉ mình với ạ 🙏",
        ],
        ["thuytrang", "Mình thiết kế poster A3 luôn nha, có QR dẫn tới bản demo 🎨 File xong trước Thứ 5 ạ."],
        ["thuhien", "Ok Trang, mình gửi nội dung chữ cho poster tối nay.", { reply: 7 }],
        [
          "vietdung",
          "Form khảo sát xong rồi nè, mình gửi link cho {@thu} rồi, bạn phát vào các nhóm lớp giúp mình.",
        ],
        ["thu", "Mình nhận rồi, đã gửi vào 3 nhóm lớp ạ 🙌", { edited: true }],
        [
          "thuhien",
          "Đã có 18 phản hồi sau 1 tiếng, nhanh quá 😲",
          { react: { "🎉": ["thu", "vietdung", "kimngan"] } },
        ],
        ["kimngan", "Nhớ gửi hoá đơn in poster cho mình ghi vào quỹ nhóm nhé mọi người."],
      ],
    },
    {
      name: "Core team",
      description: "Kênh riêng cho core team: kiến trúc, rủi ro và tiến độ",
      private: ["quocbao", "mentortuan", "minhanh", "thu"],
      lines: [
        [
          "mentortuan",
          "Kênh này để core team trao đổi riêng về kiến trúc và tiến độ nhé. Anh thấy nhịp hiện tại ổn, nhưng cần giữ scope MVP chặt, đừng để phát sinh tính năng mới.",
        ],
        [
          "thu",
          "Dạ anh. Em cũng đang lo là các bạn hay đề xuất thêm: chia hoá đơn nhóm, quét hoá đơn bằng camera... Em ghi vào backlog vòng sau được không ạ?",
        ],
        [
          "mentortuan",
          "Được. Ghi vào cột backlog, gắn nhãn “Sau MVP”. Khi nào xong luồng chính thì mới xét.",
          { reply: 1 },
        ],
        [
          "quocbao",
          "Backend: auth + CRUD transactions xong khoảng cuối tuần. Thống kê tuần mình viết bằng aggregation pipeline ($match theo userId + khoảng ngày, $group theo ngày). Ổn.",
        ],
        [
          "minhanh",
          "Bên mobile bạn Long đang gánh khá nhiều (màn thêm, offline sync). Mình có thể nhận thêm phần sync để chia bớt được không Thu?",
          { react: { "👍": ["mentortuan"] } },
        ],
        ["thu", "Cảm ơn Minh Anh nhiều. Mình ghi tên Minh Anh cùng làm với Long nhé, hai bạn tự chia việc.", { reply: 4 }],
        [
          "mentortuan",
          "Rủi ro lớn nhất anh thấy là offline sync, hay phát sinh lỗi bất ngờ. Nên làm bản đơn giản trước (queue + retry), có test với mạng chập chờn rồi mới tối ưu.",
        ],
        ["quocbao", "Đồng ý. Mình sẽ viết sẵn vài case test API cho trường hợp gửi trùng clientId.", { reply: 6 }],
        [
          "thu",
          "Mình sẽ đưa mục “test mạng chập chờn” vào checklist của thẻ Đồng bộ offline. Cảm ơn anh Tuấn và Bảo ạ.",
        ],
        ["minhanh", "Tuần sau em muốn xin thêm 1 buổi review code chung cả nhóm để mọi người cùng nắm mặt bằng chung ạ."],
        [
          "mentortuan",
          "Hay đấy, tối Thứ 6 sau họp anh dành 30 phút review live một PR.",
          { reply: 9, react: { "🙌": ["thu", "minhanh", "quocbao"] } },
        ],
      ],
    },
    {
      name: "Kênh họp",
      description: "Phòng họp thoại của nhóm",
      type: "VOICE",
      followers: "all",
    },
    {
      name: "Kênh 1",
      description: "Tập trung học và làm việc theo phiên Pomodoro",
      type: "POMODORO",
      followers: "all",
    },
  ],
  boards: [
    {
      name: "Đồ án 1",
      description: "Bảng công việc của dự án Tiêu Gọn (MVP)",
      columns: [
        { title: "To do", kind: "TODO" },
        { title: "In progress", kind: "IN_PROGRESS" },
        { title: "Review", kind: "REVIEW" },
        { title: "Done", kind: "DONE" },
      ],
      labels: [
        ["Mobile", "blue"],
        ["Backend", "green"],
        ["UI/UX", "pink"],
        ["Bug", "red"],
        ["Test", "orange"],
        ["Docs", "gray"],
      ],
      tasks: [
        // To do
        {
          title: "Push thông báo nhắc ghi chép mỗi tối (expo-notifications)",
          col: 0,
          desc: "Nhắc lúc 21h nếu hôm nay chưa ghi khoản nào; cho phép bật/tắt và đổi giờ nhắc trong Cài đặt.",
          labels: ["Mobile", "Backend"],
          assignees: ["minhanh"],
          points: 5,
          dueInDays: 14,
        },
        {
          title: "Test e2e luồng chính: đăng ký → thêm khoản chi → xem thống kê",
          col: 0,
          desc: "Dùng Maestro hoặc Detox, chạy trên máy ảo Android.",
          labels: ["Test"],
          assignees: ["phuongthao", "thu"],
          points: 5,
          dueInDays: 18,
          checklist: [
            ["Chọn công cụ (Maestro / Detox)", false],
            ["Kịch bản đăng ký + đăng nhập", false],
            ["Kịch bản thêm khoản chi", false],
            ["Kịch bản xem thống kê tuần", false],
          ],
          comments: [["thu", "Mình nhận cùng Thảo để học cách viết test nhé."]],
        },
        {
          title: "Viết README + hướng dẫn chạy dự án (docker-compose, .env.example)",
          col: 0,
          desc: "Mô tả cách chạy API + Mongo bằng docker-compose và cách chạy app bằng Expo Go.",
          labels: ["Docs"],
          assignees: ["thu"],
          points: 2,
          dueInDays: 7,
          comments: [["giahuy", "Mình có sẵn docker-compose rồi, Thu chỉ cần mô tả lệnh chạy thôi."]],
        },
        // In progress
        {
          title: "Màn hình Thêm khoản chi: nhập số tiền, chọn danh mục, ghi chú",
          col: 1,
          desc: "Luồng thêm khoản chi trong 3 chạm theo Figma v1.",
          labels: ["Mobile"],
          assignees: ["hoanglong"],
          points: 5,
          startInDays: -3,
          dueInDays: 1,
          checklist: [
            ["Ô nhập số tiền (bàn phím số, hiển thị 1.500.000)", true],
            ["Chọn danh mục bằng lưới icon", true],
            ["Chọn ngày (mặc định hôm nay)", false],
            ["Gọi API tạo khoản chi + hiển thị lỗi", false],
          ],
          comments: [["thuytrang", "Icon danh mục mình đã gửi file SVG rồi nha ✨"]],
        },
        {
          title: "Sửa lỗi app crash khi nhập số tiền có dấu chấm (1.5)",
          col: 1,
          desc: "Chỉ cho nhập chữ số, format dấu ngăn cách hàng nghìn khi hiển thị.",
          labels: ["Bug", "Mobile"],
          assignees: ["hoanglong"],
          points: 2,
          dueInDays: 1,
          comments: [["phuongthao", "Mình đã đính kèm video tái hiện lỗi trên Android."]],
        },
        {
          title: "API /transactions: CRUD + phân trang cursor + clientId chống tạo trùng",
          col: 1,
          desc: "Trả về nextCursor; gửi lại cùng clientId thì trả bản ghi cũ (idempotent).",
          labels: ["Backend"],
          assignees: ["duyhung", "quocbao"],
          points: 8,
          startInDays: -3,
          dueInDays: 3,
          checklist: [
            ["POST /transactions + validate bằng zod", true],
            ["GET /transactions phân trang theo cursor (date, _id)", false],
            ["PATCH / DELETE (xoá mềm deletedAt)", false],
            ["Unique index (userId, clientId) + xử lý lỗi 11000", false],
          ],
          comments: [["phuongthao", "Mình sẽ test lại các case validate ngay khi có bản trên staging."]],
        },
        {
          title: "Thống kê theo tuần: biểu đồ cột + top danh mục",
          col: 1,
          desc: "Biểu đồ cột chi tiêu 7 ngày gần nhất, danh sách top 3 danh mục. Đang spike thư viện chart.",
          labels: ["Mobile", "UI/UX"],
          assignees: ["thanhtung"],
          points: 5,
          startInDays: -1,
          dueInDays: 6,
          comments: [["mentortuan", "Nhớ xử lý trường hợp tuần chưa có dữ liệu (màn hình rỗng)."]],
        },
        {
          title: "Đồng bộ offline: hàng đợi thao tác + retry khi có mạng",
          col: 1,
          desc: "Lưu thao tác cục bộ, đẩy lên API khi có mạng. Xung đột dùng last-write-wins theo updatedAt.",
          labels: ["Mobile"],
          assignees: ["minhanh", "hoanglong"],
          points: 8,
          startInDays: -2,
          dueInDays: 9,
          checklist: [
            ["Lưu thao tác (create/update/delete) vào hàng đợi cục bộ", true],
            ["Bắt trạng thái mạng bằng NetInfo", false],
            ["Đẩy hàng đợi lên API kèm clientId + updatedAt", false],
            ["Hiển thị trạng thái “chưa đồng bộ” trên từng khoản", false],
            ["Test với mạng chập chờn", false],
          ],
          comments: [["mentortuan", "Làm bản đơn giản trước (queue + retry), tối ưu sau."]],
        },
        {
          title: "Khảo sát 20–30 sinh viên về thói quen ghi chép chi tiêu",
          col: 1,
          desc: "Form đã gửi vào các nhóm lớp, đang thu thập và tổng hợp số liệu cho phần báo cáo.",
          labels: ["Docs"],
          assignees: ["thu", "vietdung"],
          points: 3,
          startInDays: -3,
          dueInDays: 2,
          checklist: [
            ["Soạn câu hỏi khảo sát", true],
            ["Gửi vào các nhóm lớp", true],
            ["Đủ 25+ phản hồi", false],
            ["Tổng hợp biểu đồ cho báo cáo", false],
          ],
        },
        // Review
        {
          title: "Màn hình Đăng nhập / Đăng ký (Expo Router, lưu token SecureStore)",
          col: 2,
          desc: "Form có validate, lưu refresh token bằng expo-secure-store.",
          labels: ["Mobile"],
          assignees: ["hoanglong"],
          points: 5,
          dueInDays: 1,
          checklist: [
            ["Form đăng nhập + validate email/mật khẩu", true],
            ["Form đăng ký", true],
            ["Lưu refresh token bằng expo-secure-store", true],
            ["Tự đăng nhập lại khi mở app", false],
          ],
          comments: [["minhanh", "Mình đã review, còn 2 comment nhỏ về xử lý lỗi mạng."]],
        },
        {
          title: "API auth: register / login / refresh (bcrypt + JWT)",
          col: 2,
          desc: "Băm mật khẩu bằng bcrypt, access token 15 phút, refresh token lưu bản hash.",
          labels: ["Backend"],
          assignees: ["quocbao"],
          points: 5,
          dueInDays: -1,
          comments: [
            ["mentortuan", "Refresh token nhớ xoay vòng và lưu hash trong DB nhé."],
            ["quocbao", "Ok anh, em đang sửa."],
          ],
        },
        {
          title: "Dark mode: theme sáng/tối + token màu dùng chung",
          col: 2,
          desc: "Theme object chứa background, surface, text, primary cho cả hai chế độ, theo bảng màu của Trang.",
          labels: ["Mobile", "UI/UX"],
          assignees: ["minhanh"],
          points: 3,
          dueInDays: 2,
          comments: [["thuytrang", "Màu primary trên nền tối hơi chói, mình gửi lại tông nhạt hơn nhé 💜"]],
        },
        // Done
        {
          title: "Khởi tạo repo: app Expo + API Express + docker-compose Mongo",
          col: 3,
          desc: "Cấu trúc thư mục, eslint/prettier, husky + commitlint, docker-compose chạy MongoDB và API bằng một lệnh.",
          labels: ["Backend", "Mobile"],
          assignees: ["giahuy"],
          points: 3,
          startInDays: -5,
          dueInDays: -4,
          comments: [["thu", "Clone về chạy một lệnh là lên, cảm ơn Huy nhiều!"]],
        },
        {
          title: "Wireframe & Figma v1: Đăng nhập, Trang chủ, Thêm khoản chi, Thống kê",
          col: 3,
          desc: "Bản thiết kế đầu tiên với tông tím nhạt và xanh mint.",
          labels: ["UI/UX"],
          assignees: ["thuytrang"],
          points: 5,
          startInDays: -5,
          dueInDays: -2,
          comments: [["mentortuan", "Luồng thêm khoản chi gọn, giữ vậy nhé."]],
        },
        {
          title: "Thiết kế schema MongoDB: users, transactions, categories",
          col: 3,
          desc: "Amount lưu số nguyên VND, thêm deletedAt cho xoá mềm, index (userId, date).",
          labels: ["Backend"],
          assignees: ["quocbao"],
          points: 3,
          dueInDays: -3,
          checklist: [
            ["Collection users (email unique)", true],
            ["Collection transactions + index (userId, date)", true],
            ["Collection categories mặc định", true],
            ["Viết tài liệu schema trong README", true],
          ],
          comments: [["duyhung", "Đã đọc, rõ ràng, mình bám theo khi viết model."]],
        },
        {
          title: "Chốt phạm vi MVP và quy ước làm việc (branch, commit, PR)",
          col: 3,
          desc: "Phạm vi MVP, quy ước nhánh, Conventional Commits và Definition of Done.",
          labels: ["Docs"],
          assignees: ["thu"],
          points: 1,
          dueInDays: -5,
        },
      ],
    },
  ],
  studySets: [
    {
      slug: "appdev-react-native-expo",
      title: "React Native & Expo cơ bản",
      description: "Những khái niệm nền tảng khi làm app di động bằng React Native và Expo.",
      tags: ["react-native", "expo", "mobile"],
      language: "vi",
      visibility: "WORKSPACE",
      owner: "hoanglong",
      items: [
        {
          type: "FLASHCARD",
          prompt: "Expo là gì và khác gì so với dùng React Native thuần?",
          answerText:
            "Expo là bộ framework + công cụ bao quanh React Native: có sẵn SDK cho các API thiết bị (camera, thông báo, secure-store...), Expo Go để chạy thử nhanh và EAS để build/đưa app lên store. React Native thuần phải tự cấu hình Xcode/Android Studio nhiều hơn.",
        },
        {
          type: "FLASHCARD",
          prompt: "Thành phần nào trong React Native thay cho <div> và <p>?",
          answerText: "<View> cho khối bố cục và <Text> cho văn bản. Mọi chữ phải nằm trong <Text>.",
        },
        {
          type: "FLASHCARD",
          prompt: "Vì sao FlatList tốt hơn ScrollView + map cho danh sách dài?",
          answerText:
            "FlatList chỉ render các phần tử gần vùng nhìn thấy (ảo hoá danh sách) nên tiết kiệm bộ nhớ; ScrollView render toàn bộ phần tử một lần nên nặng với danh sách dài.",
        },
        {
          type: "FLASHCARD",
          prompt: "Prop keyExtractor của FlatList có tác dụng gì?",
          answerText:
            "Trả về khoá duy nhất (kiểu chuỗi) cho từng item để React nhận diện và tái sử dụng đúng phần tử khi danh sách thay đổi.",
        },
        {
          type: "FLASHCARD",
          prompt: "Expo Router định tuyến theo cách nào?",
          answerText:
            "Theo cấu trúc file: mỗi file trong thư mục app/ là một route (app/index.tsx ứng với “/”, app/[id].tsx là route động); layout đặt trong _layout.tsx.",
        },
        {
          type: "FLASHCARD",
          prompt: "Vì sao không nên lưu token đăng nhập trong AsyncStorage?",
          answerText:
            "AsyncStorage lưu dạng văn bản thường, không mã hoá. Token nên lưu bằng expo-secure-store (Keychain trên iOS, Keystore trên Android).",
        },
        {
          type: "FLASHCARD",
          prompt: "StyleSheet trong React Native khác CSS web ở điểm nào?",
          answerText:
            "Style là object JavaScript với tên thuộc tính camelCase (backgroundColor), không có cascade như CSS, và layout mặc định là Flexbox với flexDirection là column.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Lệnh nào dùng để tạo dự án Expo mới?",
          options: [
            "npx create-expo-app@latest",
            "npm install expo-new",
            "npx react-native create-expo",
            "expo build --new",
          ],
          correctIndex: 0,
          explanation: "create-expo-app là công cụ chính thức để khởi tạo dự án Expo.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Hook nào dùng để chạy side effect (ví dụ gọi API khi màn hình mount) trong component hàm?",
          options: ["useEffect", "useMemo", "useRef", "useContext"],
          correctIndex: 0,
          explanation: "useEffect chạy sau khi render; mảng phụ thuộc rỗng [] nghĩa là chỉ chạy một lần khi mount.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Trong React Native, giá trị mặc định của flexDirection là gì?",
          options: ["column", "row", "row-reverse", "column-reverse"],
          correctIndex: 0,
          explanation: "Khác với CSS web (mặc định row), React Native mặc định xếp theo chiều dọc: column.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Component nào giúp tránh bàn phím ảo che mất ô nhập liệu?",
          options: ["KeyboardAvoidingView", "SafeAreaView", "StatusBar", "Modal"],
          correctIndex: 0,
          explanation: "SafeAreaView tránh vùng tai thỏ/thanh hệ thống, còn KeyboardAvoidingView đẩy nội dung lên khi bàn phím hiện.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Có thể dùng thẻ <div> trực tiếp trong React Native như trên web.",
          correct: false,
          explanation: "React Native không chạy trong DOM; phải dùng các component như View, Text, Image.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Expo Go cho phép chạy thử app mà không cần tự build file APK/IPA.",
          correct: true,
          explanation:
            "Đúng với các thư viện nằm trong Expo SDK; thư viện có mã native tuỳ biến cần dùng development build.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Hook của React dùng để khai báo state cục bộ trong component hàm là ______.",
          accepted: ["usestate"],
          explanation: "const [count, setCount] = useState(0)",
        },
        {
          type: "FILL_BLANK",
          prompt: "Trong Expo Router, để đẩy thêm một màn hình mới lên stack ta gọi router.______('/settings').",
          accepted: ["push"],
          explanation: "router.push thêm màn hình mới; router.replace thay thế màn hình hiện tại.",
        },
      ],
    },
    {
      slug: "appdev-rest-mongodb",
      title: "REST API & MongoDB cho backend app",
      description: "Kiến thức REST, mã trạng thái HTTP, JWT và MongoDB dùng khi viết backend cho app di động.",
      tags: ["rest", "mongodb", "express", "backend"],
      language: "vi",
      visibility: "WORKSPACE",
      owner: "quocbao",
      items: [
        {
          type: "FLASHCARD",
          prompt: "Các phương thức HTTP chuẩn tương ứng với CRUD?",
          answerText:
            "Create → POST, Read → GET, Update → PUT (thay toàn bộ) hoặc PATCH (sửa một phần), Delete → DELETE.",
        },
        {
          type: "FLASHCARD",
          prompt: "Phân biệt các mã trạng thái 200, 201, 204, 400, 401, 403, 404.",
          answerText:
            "200 OK; 201 tạo mới thành công; 204 thành công nhưng không có nội dung trả về; 400 yêu cầu sai/dữ liệu không hợp lệ; 401 chưa xác thực; 403 đã xác thực nhưng không đủ quyền; 404 không tìm thấy.",
        },
        {
          type: "FLASHCARD",
          prompt: "Idempotent là gì? Những phương thức HTTP nào idempotent?",
          answerText:
            "Gọi nhiều lần cho cùng kết quả/trạng thái hệ thống như gọi một lần. GET, PUT, DELETE (và HEAD, OPTIONS) idempotent; POST thì không.",
        },
        {
          type: "FLASHCARD",
          prompt: "Vì sao cần index trong MongoDB?",
          answerText:
            "Index giúp truy vấn theo trường nhanh mà không phải quét toàn bộ collection; đổi lại tốn thêm bộ nhớ và làm thao tác ghi chậm hơn một chút.",
        },
        {
          type: "FLASHCARD",
          prompt: "Aggregation pipeline của MongoDB là gì? Kể vài stage thường dùng.",
          answerText:
            "Chuỗi các stage xử lý dữ liệu lần lượt: $match (lọc), $group (gom nhóm), $sort, $project, $lookup (nối collection), $limit.",
        },
        {
          type: "FLASHCARD",
          prompt: "Phân trang cursor-based khác offset (skip/limit) thế nào?",
          answerText:
            "Cursor dùng giá trị của bản ghi cuối (ví dụ date + _id) để lấy trang kế tiếp: ổn định khi dữ liệu thay đổi và không chậm dần như skip lớn.",
        },
        {
          type: "FLASHCARD",
          prompt: "JWT gồm những phần nào?",
          answerText:
            "Ba phần ngăn bởi dấu chấm: header.payload.signature (mã hoá Base64URL). Payload không được mã hoá nên không đặt dữ liệu nhạy cảm vào đó.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Mã trạng thái phù hợp nhất khi tạo khoản chi mới thành công là?",
          options: ["200 OK", "201 Created", "204 No Content", "302 Found"],
          correctIndex: 1,
          explanation: "201 Created cho biết tài nguyên mới đã được tạo.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Trong MongoDB, trường _id mặc định có kiểu gì?",
          options: ["ObjectId", "Số nguyên tự tăng", "UUID dạng chuỗi", "Date"],
          correctIndex: 0,
          explanation: "Nếu không tự đặt, MongoDB sinh _id kiểu ObjectId (12 byte).",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Truy vấn nào lọc các document có amount lớn hơn 50000 trong MongoDB?",
          options: [
            "{ amount: { $gt: 50000 } }",
            "{ amount: { $more: 50000 } }",
            "{ amount > 50000 }",
            "{ $gt: { amount: 50000 } }",
          ],
          correctIndex: 0,
          explanation: "$gt là greater than; $gte là lớn hơn hoặc bằng.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Để tính tổng amount theo từng ngày cho một user, pipeline hợp lý là?",
          options: [
            "$match theo userId, rồi $group theo ngày với $sum của amount",
            "$sort rồi $limit",
            "$lookup rồi $unwind",
            "$project rồi $skip",
          ],
          correctIndex: 0,
          explanation: "$match lọc đúng người dùng, $group gom theo ngày và dùng $sum để cộng amount.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "PUT là phương thức idempotent.",
          correct: true,
          explanation: "Gọi PUT nhiều lần với cùng dữ liệu cho cùng trạng thái cuối cùng.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Mật khẩu nên được lưu trong DB dưới dạng đã băm (hash) bằng thuật toán như bcrypt hoặc argon2.",
          correct: true,
          explanation: "Không lưu mật khẩu gốc; hash có salt giúp hạn chế tác hại khi lộ dữ liệu.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Để Express đọc được body JSON của request, ta dùng middleware app.use(express.______()).",
          accepted: ["json"],
          explanation: "express.json() parse body có Content-Type là application/json.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Mã lỗi của MongoDB khi insert vi phạm unique index (duplicate key) là E______ (điền số).",
          accepted: ["11000"],
          explanation: "Lỗi duplicate key có code 11000.",
        },
      ],
    },
    {
      slug: "appdev-git-workflow",
      title: "Git workflow & code review",
      description: "Lệnh Git thiết yếu, quy ước commit và cách review code mang tính xây dựng khi làm việc nhóm.",
      tags: ["git", "code-review", "teamwork"],
      language: "vi",
      visibility: "PUBLIC",
      owner: "mentortuan",
      items: [
        {
          type: "FLASHCARD",
          prompt: "git rebase khác git merge thế nào?",
          answerText:
            "Merge tạo thêm một commit gộp và giữ nguyên lịch sử rẽ nhánh; rebase viết lại các commit của nhánh lên đầu nhánh đích, cho lịch sử thẳng hàng. Không rebase nhánh đã chia sẻ cho người khác.",
        },
        {
          type: "FLASHCARD",
          prompt: "Conventional Commits có định dạng như thế nào?",
          answerText:
            "<type>(<scope>): <mô tả>, ví dụ feat(auth): thêm đăng nhập. Các type hay dùng: feat, fix, docs, refactor, test, chore.",
        },
        {
          type: "FLASHCARD",
          prompt: "git stash dùng khi nào?",
          answerText:
            "Cất tạm các thay đổi chưa commit để chuyển nhánh hoặc pull; lấy lại bằng git stash pop.",
        },
        {
          type: "FLASHCARD",
          prompt: "Vì sao Pull Request nên nhỏ và tập trung vào một việc?",
          answerText:
            "PR nhỏ dễ review, ít sót lỗi, merge nhanh và dễ revert nếu có vấn đề.",
        },
        {
          type: "FLASHCARD",
          prompt: "Reviewer nên nhận xét theo hướng nào để mang tính xây dựng?",
          answerText:
            "Nêu cụ thể đoạn code và lý do, đưa gợi ý thay thế, phân biệt ý bắt buộc sửa với ý tuỳ chọn (ghi “nit:”), giữ giọng tôn trọng và nhớ khen điểm tốt.",
        },
        {
          type: "FLASHCARD",
          prompt: "git cherry-pick làm gì?",
          answerText: "Áp dụng một (hoặc vài) commit cụ thể từ nhánh khác vào nhánh hiện tại.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Lệnh nào tạo nhánh mới và chuyển sang nhánh đó luôn?",
          options: [
            "git checkout -b feat/login",
            "git branch feat/login -d",
            "git new feat/login",
            "git switch feat/login --delete",
          ],
          correctIndex: 0,
          explanation: "git checkout -b (hoặc git switch -c) tạo nhánh mới và chuyển sang đó.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Lệnh nào huỷ commit gần nhất nhưng giữ lại thay đổi (ở trạng thái đã stage)?",
          options: [
            "git reset --soft HEAD~1",
            "git reset --hard HEAD~1",
            "git revert --hard",
            "git clean -fd",
          ],
          correctIndex: 0,
          explanation: "--soft giữ thay đổi trong vùng staging; --hard sẽ bỏ luôn thay đổi.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Muốn tạo commit MỚI đảo ngược tác dụng của một commit đã đẩy lên nhánh chung, nên dùng?",
          options: ["git revert <commit>", "git reset --hard <commit>", "git rebase -i", "git commit --amend"],
          correctIndex: 0,
          explanation: "revert không viết lại lịch sử nên an toàn cho nhánh dùng chung.",
        },
        {
          type: "MULTIPLE_CHOICE",
          prompt: "Tệp nào dùng để Git bỏ qua việc theo dõi node_modules hay .env?",
          options: [".gitignore", ".gitkeep", ".gitmodules", ".gitattributes"],
          correctIndex: 0,
          explanation: ".gitignore liệt kê các mẫu đường dẫn mà Git bỏ qua.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Nên dùng git push --force trên nhánh main dùng chung để sửa lại lịch sử.",
          correct: false,
          explanation: "Force push làm mất commit của người khác; nếu thật sự cần, dùng --force-with-lease trên nhánh cá nhân.",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Sau khi git add, tệp ở trạng thái staged và sẽ được đưa vào commit kế tiếp.",
          correct: true,
          explanation: "Vùng staging chứa những thay đổi sẽ vào commit tiếp theo.",
        },
        {
          type: "FILL_BLANK",
          prompt: "Lệnh lấy mã mới từ remote và gộp vào nhánh hiện tại là git ______.",
          accepted: ["pull"],
          explanation: "git pull = git fetch + merge (hoặc rebase tuỳ cấu hình).",
        },
        {
          type: "FILL_BLANK",
          prompt: "Xem lịch sử commit gọn, mỗi commit một dòng: git log --______",
          accepted: ["oneline"],
          explanation: "git log --oneline hiển thị mã băm rút gọn và tiêu đề commit.",
        },
      ],
    },
  ],
  expenses: [
    {
      paidBy: "kimngan",
      amount: 240000,
      description: "Cà phê buổi họp kick-off dự án Tiêu Gọn",
      category: "FOOD",
      among: ["thu", "quocbao", "minhanh", "hoanglong", "thuytrang", "kimngan"],
      daysAgo: 5,
    },
    {
      paidBy: "kimngan",
      amount: 350000,
      description: "Thuê tên miền cho trang giới thiệu app (1 năm)",
      category: "OTHER",
      among: ["thu", "quocbao", "giahuy", "duyhung", "kimngan"],
      daysAgo: 3,
    },
    {
      paidBy: "giahuy",
      amount: 120000,
      description: "Phí chạy server staging tháng đầu",
      category: "SERVER",
      among: ["thu", "quocbao", "giahuy", "duyhung"],
      daysAgo: 4,
    },
    {
      paidBy: "kimngan",
      amount: 180000,
      description: "In poster A3 cho buổi demo (3 tờ)",
      category: "PRINTING",
      among: ["thu", "thuytrang", "thuhien", "kimngan"],
      daysAgo: 2,
    },
    {
      paidBy: "kimngan",
      amount: 450000,
      description: "Pizza buổi demo nội bộ",
      category: "FOOD",
      among: ["thu", "quocbao", "minhanh", "hoanglong", "thuytrang", "giahuy", "phuongthao", "thuhien", "kimngan"],
      daysAgo: 1,
    },
  ],
};
