/**
 * Nội dung HƯ CẤU cho phân hệ O2O (địa điểm học tập + tiệm in) quanh một khu trường đại học ở Thủ Đức, TP.HCM.
 * Tên quán/tiệm, số nhà, giờ mở cửa đều bịa — không dùng thương hiệu hay số điện thoại thật. Toạ độ chỉ mang tính minh hoạ
 * (đều nằm trong bán kính ~2,5 km quanh cổng trường) để màn "gần tôi" có dữ liệu khi người xem ở khu Thủ Đức.
 */
import type { PersonKey } from "../../types";

export type AmenityCode = "wifi_fast" | "power_outlets" | "quiet_zone" | "ac" | "open_late" | "group_tables" | "printer" | "parking";

export interface HourRow {
  day: number;
  open: string;
  close: string;
}

const week = (days: readonly number[], open: string, close: string): HourRow[] => days.map((day) => ({ day, open, close }));
const ALL = [0, 1, 2, 3, 4, 5, 6] as const;
const MON_SAT = [1, 2, 3, 4, 5, 6] as const;
const MON_FRI = [1, 2, 3, 4, 5] as const;

export interface LocationSpec {
  slug: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: "CAFE" | "PRINT_SHOP" | "LIBRARY";
  amenities: AmenityCode[];
  hours: HourRow[];
  /** Thành viên đã đề xuất địa điểm. */
  by: PersonKey;
  /** Đề xuất cách đây bao nhiêu ngày (bị chặn dưới bởi ngày tạo tài khoản người đề xuất). */
  daysAgo: number;
  /** Có ⇒ địa điểm bị ẩn (HIDDEN) với lý do này. */
  hiddenReason?: string;
}

export const LOCATIONS: readonly LocationSpec[] = [
  { slug: "goc-lang", name: "Cà phê Góc Lặng", address: "Số 18, đường số 6, khu phố 3, phường Linh Trung, TP. Thủ Đức", lat: 10.8718, lng: 106.8011, type: "CAFE", amenities: ["wifi_fast", "power_outlets", "quiet_zone", "ac"], hours: week(ALL, "07:00", "22:00"), by: "khanhlinh", daysAgo: 19 },
  { slug: "may-chieu", name: "Quán Mây Chiều", address: "Số 52/3, đường Kha Vạn Cân, phường Linh Chiểu, TP. Thủ Đức", lat: 10.8689, lng: 106.8068, type: "CAFE", amenities: ["wifi_fast", "power_outlets", "group_tables", "open_late"], hours: week(ALL, "08:00", "24:00"), by: "hoanglong", daysAgo: 18 },
  { slug: "hien-nha", name: "Trà & Sách Hiên Nhà", address: "Số 9, hẻm 24 đường Hoàng Diệu 2, phường Linh Trung, TP. Thủ Đức", lat: 10.8741, lng: 106.8032, type: "CAFE", amenities: ["wifi_fast", "quiet_zone", "parking"], hours: week(ALL, "07:30", "21:30"), by: "thuhien", daysAgo: 17 },
  { slug: "ban-dai", name: "Cà phê Bàn Dài Deadline", address: "Số 120, đường Võ Văn Ngân, phường Bình Thọ, TP. Thủ Đức", lat: 10.8666, lng: 106.8001, type: "CAFE", amenities: ["wifi_fast", "power_outlets", "ac", "group_tables", "open_late"], hours: [...week(MON_SAT, "09:00", "24:00"), ...week([0], "10:00", "23:00")], by: "ngocdiep", daysAgo: 16 },
  { slug: "nang-som", name: "Quán Nắng Sớm", address: "Số 7, đường số 11, khu phố 5, phường Linh Trung, TP. Thủ Đức", lat: 10.8730, lng: 106.8095, type: "CAFE", amenities: ["wifi_fast", "parking"], hours: week(ALL, "06:00", "21:00"), by: "minhanh", daysAgo: 15 },
  { slug: "hat-nho", name: "Hạt Cà Phê Nhỏ", address: "Số 33/5, đường Lê Văn Việt, phường Hiệp Phú, TP. Thủ Đức", lat: 10.8654, lng: 106.8052, type: "CAFE", amenities: ["power_outlets", "quiet_zone", "ac"], hours: week(MON_SAT, "07:00", "21:30"), by: "kimngan", daysAgo: 14 },
  { slug: "tang-thuong", name: "Cà phê Tầng Thượng Gió", address: "Số 245, đường Tô Ngọc Vân, phường Linh Tây, TP. Thủ Đức", lat: 10.8702, lng: 106.8123, type: "CAFE", amenities: ["wifi_fast", "group_tables", "parking", "open_late"], hours: week(ALL, "10:00", "24:00"), by: "giahuy", daysAgo: 13 },
  { slug: "dem-thi", name: "Tiệm Trà Đêm Thi", address: "Số 61, đường số 8, khu phố 2, phường Linh Trung, TP. Thủ Đức", lat: 10.8677, lng: 106.8029, type: "CAFE", amenities: ["wifi_fast", "power_outlets", "ac", "group_tables", "open_late"], hours: week(ALL, "12:00", "24:00"), by: "tuankiet", daysAgo: 12 },

  { slug: "hat-giong", name: "Thư viện Cộng đồng Hạt Giống", address: "Số 3, đường Hoàng Diệu 2, phường Linh Chiểu, TP. Thủ Đức", lat: 10.8762, lng: 106.8058, type: "LIBRARY", amenities: ["wifi_fast", "power_outlets", "quiet_zone", "ac", "parking"], hours: [...week(MON_SAT, "08:00", "20:30"), ...week([0], "08:00", "17:00")], by: "baotram", daysAgo: 20 },
  { slug: "mam-xanh", name: "Không gian học chung Mầm Xanh", address: "Tầng 2, số 15 đường số 4, phường Linh Trung, TP. Thủ Đức", lat: 10.8693, lng: 106.8017, type: "LIBRARY", amenities: ["wifi_fast", "power_outlets", "ac", "group_tables", "printer", "open_late"], hours: week(ALL, "07:30", "23:00"), by: "minhanh", daysAgo: 17 },
  { slug: "sach-cu", name: "Phòng đọc Sách Cũ", address: "Số 27, đường Đặng Văn Bi, phường Bình Thọ, TP. Thủ Đức", lat: 10.8645, lng: 106.8087, type: "LIBRARY", amenities: ["quiet_zone", "ac"], hours: week(MON_SAT, "08:00", "19:00"), by: "phuongthao", daysAgo: 11 },
  { slug: "mua-thi", name: "Thư quán Mùa Thi", address: "Số 88, đường Lê Văn Chí, phường Linh Trung, TP. Thủ Đức", lat: 10.8725, lng: 106.8140, type: "LIBRARY", amenities: ["wifi_fast", "power_outlets", "quiet_zone", "ac", "open_late"], hours: week(ALL, "06:00", "24:00"), by: "haidang", daysAgo: 10 },

  { slug: "ban-sao-nhanh", name: "Tiệm in Bản Sao Nhanh", address: "Số 2, đường số 6 (đối diện cổng chính trường), phường Linh Trung, TP. Thủ Đức", lat: 10.8708, lng: 106.8036, type: "PRINT_SHOP", amenities: ["printer", "ac"], hours: [...week(MON_SAT, "07:00", "21:00"), ...week([0], "08:00", "17:00")], by: "thuhien", daysAgo: 18 },
  { slug: "cong-sau", name: "In nhanh Cổng Sau", address: "Số 16/2, đường số 9, phường Linh Trung, TP. Thủ Đức", lat: 10.8671, lng: 106.7989, type: "PRINT_SHOP", amenities: ["printer", "parking"], hours: week(MON_SAT, "07:30", "20:00"), by: "giahuy", daysAgo: 16 },
  { slug: "quan-xanh", name: "Photocopy Thư Quán Xanh", address: "Số 41, đường Hoàng Diệu 2, phường Linh Chiểu, TP. Thủ Đức", lat: 10.8736, lng: 106.8076, type: "PRINT_SHOP", amenities: ["printer", "ac", "open_late"], hours: week(ALL, "07:00", "22:30"), by: "duyhung", daysAgo: 14 },
  { slug: "giay-trang", name: "Tiệm in luận văn Giấy Trắng", address: "Số 70, đường Võ Văn Ngân, phường Bình Thọ, TP. Thủ Đức", lat: 10.8648, lng: 106.8035, type: "PRINT_SHOP", amenities: ["printer", "ac", "parking"], hours: [...week(MON_FRI, "08:00", "20:00"), ...week([6], "08:00", "18:00")], by: "phuocloi", daysAgo: 12 },
  { slug: "thang-nam", name: "Quán in Tháng Năm", address: "Số 5, hẻm 12 đường số 11, phường Linh Trung, TP. Thủ Đức", lat: 10.8722, lng: 106.7996, type: "PRINT_SHOP", amenities: ["printer"], hours: week(MON_SAT, "08:00", "19:00"), by: "quynhnhu", daysAgo: 8 },

  { slug: "duong-ham", name: "Cà phê Đường Hầm", address: "Số 99, đường Tô Ngọc Vân, phường Linh Tây, TP. Thủ Đức", lat: 10.8759, lng: 106.8119, type: "CAFE", amenities: ["wifi_fast", "power_outlets"], hours: week(ALL, "08:00", "22:00"), by: "ducanh", daysAgo: 15, hiddenReason: "Quán đã đóng cửa — nhiều thành viên xác nhận, tạm ẩn khỏi danh sách" },
];

export interface ReviewSpec {
  loc: string;
  by: PersonKey;
  rating: number;
  /** 1 = rất yên tĩnh … 5 = ồn. */
  noise: number;
  comment: string;
  /** Viết cách đây bao nhiêu ngày. */
  daysAgo: number;
}

export const REVIEWS: readonly ReviewSpec[] = [
  { loc: "goc-lang", by: "khanhlinh", rating: 5, noise: 1, comment: "Yên tĩnh thật sự, mình ngồi làm đề cương cả buổi chiều mà không ai bật loa. Mỗi bàn có ổ cắm sát chân, wifi tải file nhanh.", daysAgo: 17 },
  { loc: "goc-lang", by: "thu", rating: 5, noise: 1, comment: "Hợp để họp nhóm nhỏ 3–4 người nói chuyện nhẹ. Cuối tuần nên đến trước 9h để có chỗ gần cửa sổ.", daysAgo: 6 },
  { loc: "goc-lang", by: "vietdung", rating: 4, noise: 2, comment: "Cà phê ổn, chỗ ngồi thoải mái. Chiều muộn hơi đông sinh viên nên ồn hơn buổi sáng một chút.", daysAgo: 9 },

  { loc: "may-chieu", by: "hoanglong", rating: 4, noise: 4, comment: "Rộng, nhiều bàn dài cho nhóm 6–8 người, tụi mình hay làm demo app ở đây. Tối hơi ồn vì nhạc nhưng bù lại mở tới nửa đêm.", daysAgo: 15 },
  { loc: "may-chieu", by: "thu", rating: 4, noise: 4, comment: "Phù hợp họp nhóm và code chung, wifi mạnh. Muốn tập trung đọc tài liệu thì nên ngồi tầng trên cùng.", daysAgo: 8 },
  { loc: "may-chieu", by: "thaonguyen", rating: 3, noise: 4, comment: "Ổ cắm ít ở dãy bàn giữa, phải ngồi sát tường mới sạc được laptop. Đồ uống ngon nhưng ra hơi chậm giờ cao điểm.", daysAgo: 10 },
  { loc: "may-chieu", by: "giabao", rating: 5, noise: 3, comment: "Mình mới vào năm nhất, ngồi ôn bài ở đây thấy dễ chịu, có nhiều bạn khác cũng học nên không ngại.", daysAgo: 3 },

  { loc: "hien-nha", by: "thuhien", rating: 5, noise: 1, comment: "Quán sân vườn nhỏ, có kệ sách cho mượn đọc tại chỗ. Mình hay ngồi đây soạn slide buổi sáng, rất mát và yên.", daysAgo: 15 },
  { loc: "hien-nha", by: "thuytrang", rating: 5, noise: 2, comment: "Góc nào chụp ảnh cũng đẹp nên mình hay vẽ wireframe ở đây. Wifi ổn, chỉ là không có ổ cắm ở bàn ngoài vườn.", daysAgo: 7 },
  { loc: "hien-nha", by: "trungkien", rating: 4, noise: 2, comment: "Trưa nắng thì ngồi trong nhà, chiều ngồi ngoài vườn là hợp nhất. Có chỗ gửi xe máy rộng.", daysAgo: 11 },

  { loc: "ban-dai", by: "ngocdiep", rating: 5, noise: 3, comment: "Bàn dài kê sát nhau, cả nhóm đồ án 5 người ngồi chung không bị chật. Ổ cắm mỗi hai chỗ ngồi một cái, mở tới 12h đêm nên chạy deadline rất tiện.", daysAgo: 14 },
  { loc: "ban-dai", by: "phuocloi", rating: 4, noise: 3, comment: "Điều hoà mát, wifi ổn định khi cả nhóm cùng đẩy code. Đêm thứ Sáu khá đông, nên đặt chỗ trước.", daysAgo: 9 },
  { loc: "ban-dai", by: "ngoclan", rating: 4, noise: 3, comment: "Tụi mình ngồi chỉnh báo cáo ở đây cả buổi tối, chủ quán cho cắm máy chiếu nhỏ để duyệt slide.", daysAgo: 5 },
  { loc: "ban-dai", by: "quocbao", rating: 4, noise: 3, comment: "Phù hợp họp nhóm hơn là học một mình. Đồ ăn nhẹ có sẵn nên khỏi chạy đi mua.", daysAgo: 2 },

  { loc: "nang-som", by: "minhanh", rating: 4, noise: 3, comment: "Mở từ 6h sáng nên mình hay ghé trước giờ học để làm nốt bài. Wifi tốt, có chỗ để xe rộng, nhưng ổ cắm khá ít.", daysAgo: 13 },
  { loc: "nang-som", by: "ducanh", rating: 3, noise: 4, comment: "Buổi sáng đông khách đi làm nên hơi ồn. Giá mềm, hợp túi tiền sinh viên.", daysAgo: 8 },

  { loc: "hat-nho", by: "kimngan", rating: 4, noise: 1, comment: "Quán nhỏ, chỉ khoảng 12 chỗ nên luôn rất yên. Có ổ cắm ở mọi bàn nhưng không có wifi mạnh, mình dùng 4G khi cần tải file lớn.", daysAgo: 12 },
  { loc: "hat-nho", by: "baotram", rating: 5, noise: 1, comment: "Chủ quán dễ thương, nhắc nhỏ giọng khi nhóm nói chuyện to nên không gian rất hợp để học bài. Chiều Chủ nhật đóng cửa nên nhớ để ý.", daysAgo: 7 },
  { loc: "hat-nho", by: "nhatminh", rating: 4, noise: 2, comment: "Hợp để ôn thi một mình. Hơi chật khi đông, đồ uống không nhiều lựa chọn.", daysAgo: 4 },

  { loc: "tang-thuong", by: "giahuy", rating: 4, noise: 4, comment: "Tầng thượng thoáng, tối có gió. Hợp ngồi nhóm đông, thảo luận thoải mái chứ không hợp đọc tài liệu cần yên tĩnh.", daysAgo: 11 },
  { loc: "tang-thuong", by: "tanphat", rating: 3, noise: 5, comment: "Cuối tuần có nhạc sống nên khá ồn, mình đành đổi quán giữa chừng. Ngày thường thì ổn.", daysAgo: 6 },
  { loc: "tang-thuong", by: "thanhtung", rating: 4, noise: 4, comment: "View đẹp, gửi xe thuận tiện. Trời mưa phải vào trong nên bị chật.", daysAgo: 2 },

  { loc: "dem-thi", by: "tuankiet", rating: 5, noise: 3, comment: "Mùa ôn thi quán mở tới nửa đêm, có đủ ổ cắm và wifi mạnh. Nhiều bạn cùng trường ngồi học nên có động lực.", daysAgo: 10 },
  { loc: "dem-thi", by: "thu", rating: 4, noise: 3, comment: "Điều hoà mát, ngồi nhóm 4 người vừa vặn. Khuya thì nên nhắc nhau về sớm để còn ngủ.", daysAgo: 5 },
  { loc: "dem-thi", by: "hieutrung", rating: 4, noise: 3, comment: "Đêm trước buổi thi giữa kỳ mình ngồi ở đây tới 11h, nhân viên vẫn niềm nở. Trà đào ngon.", daysAgo: 3 },

  { loc: "hat-giong", by: "baotram", rating: 5, noise: 1, comment: "Thư viện cộng đồng miễn phí, phòng đọc rộng và rất yên tĩnh. Có khu máy tính và ổ cắm dọc tường, wifi dùng ổn.", daysAgo: 18 },
  { loc: "hat-giong", by: "gvhung", rating: 5, noise: 1, comment: "Không gian lý tưởng cho sinh viên ôn tập. Sách tham khảo toán và tin học khá phong phú, thủ thư hỗ trợ tận tình.", daysAgo: 12 },
  { loc: "hat-giong", by: "myhanh", rating: 4, noise: 1, comment: "Mình thích nhất là được ngồi cả ngày không phải gọi nước. Chủ nhật đóng cửa sớm lúc 17h nên cần đi trước.", daysAgo: 6 },
  { loc: "hat-giong", by: "nhatminh", rating: 5, noise: 1, comment: "Buổi sáng ít người, mình làm đề giải tích hiệu quả hơn hẳn ở ký túc xá.", daysAgo: 2 },

  { loc: "mam-xanh", by: "minhanh", rating: 5, noise: 2, comment: "Không gian học chung có bàn nhóm và cả bàn đơn, mỗi chỗ có ổ cắm. Có máy in ngay tại quầy nên in nhanh bài trước giờ vào lớp.", daysAgo: 15 },
  { loc: "mam-xanh", by: "thu", rating: 5, noise: 2, comment: "Cả nhóm mình thuê bàn nhóm vài buổi để ôn thi, giá theo giờ hợp lý. Mở đến 23h là điểm cộng lớn.", daysAgo: 9 },
  { loc: "mam-xanh", by: "yennhi", rating: 4, noise: 2, comment: "Wifi mạnh, ngồi luyện nghe IELTS bằng tai nghe không bị phân tâm. Giờ cao điểm hơi khó tìm chỗ trống.", daysAgo: 5 },
  { loc: "mam-xanh", by: "anhthu", rating: 4, noise: 2, comment: "Hay đến luyện speaking theo cặp ở phòng nhỏ cuối dãy. Mong có thêm khung giờ đặt phòng.", daysAgo: 2 },

  { loc: "sach-cu", by: "phuongthao", rating: 4, noise: 1, comment: "Phòng đọc nhỏ, mùi giấy cũ rất dễ chịu, ai cũng giữ im lặng. Không có wifi nên chỉ hợp đọc sách giấy và chép bài.", daysAgo: 9 },
  { loc: "sach-cu", by: "quynhnhu", rating: 4, noise: 1, comment: "Mình đọc sách tham khảo Writing ở đây khá nhiều. Đóng cửa lúc 19h nên buổi tối phải chuyển sang chỗ khác.", daysAgo: 5 },

  { loc: "mua-thi", by: "haidang", rating: 5, noise: 1, comment: "Mở từ 6h đến nửa đêm, mùa thi rất đông mà vẫn giữ được trật tự. Mình ôn cấu trúc dữ liệu ở đây 2 tuần liền.", daysAgo: 8 },
  { loc: "mua-thi", by: "minhkhoi", rating: 4, noise: 2, comment: "Ổ cắm đủ, điều hoà mát, wifi hơi chậm lúc đông. Nên đến sớm vì hết chỗ từ 19h.", daysAgo: 4 },
  { loc: "mua-thi", by: "camtu", rating: 4, noise: 2, comment: "Có khu riêng cho nói chuyện nhỏ nên mình luyện speaking được mà không làm phiền ai.", daysAgo: 2 },

  { loc: "ban-sao-nhanh", by: "thuhien", rating: 5, noise: 3, comment: "In tài liệu nhóm rất nhanh, 30 trang đen trắng chưa tới 5 phút. Tiệm có điều hoà và chỗ ngồi chờ.", daysAgo: 16 },
  { loc: "ban-sao-nhanh", by: "thu", rating: 5, noise: 3, comment: "Sát cổng trường nên tiện, giá niêm yết rõ ràng, in xong là lấy được ngay.", daysAgo: 7 },
  { loc: "ban-sao-nhanh", by: "baochau", rating: 4, noise: 3, comment: "Giờ cao điểm đầu học kỳ hơi đông, phải chờ khoảng 15 phút. Chất lượng bản in rõ nét.", daysAgo: 3 },

  { loc: "cong-sau", by: "giahuy", rating: 4, noise: 3, comment: "Giá rẻ nhất khu, in đen trắng A4 và A3 đều được. Không in màu nên hồ sơ cần màu phải sang tiệm khác.", daysAgo: 13 },
  { loc: "cong-sau", by: "hoanglong", rating: 4, noise: 3, comment: "In hai mặt tiết kiệm giấy, nhân viên nhắc kiểm lề trước khi in. Không có điều hoà nên trưa hơi nóng.", daysAgo: 6 },

  { loc: "quan-xanh", by: "duyhung", rating: 5, noise: 2, comment: "In màu đẹp, có đóng gáy lò xo. Đêm thi mở tới 22h30 nên in đề cương vào phút chót cũng kịp.", daysAgo: 11 },
  { loc: "quan-xanh", by: "ngoclan", rating: 4, noise: 2, comment: "In slide màu cho buổi bảo vệ, màu hơi đậm hơn bản trên màn hình nhưng vẫn đẹp. Nhân viên tư vấn lề giấy khá kỹ.", daysAgo: 5 },

  { loc: "giay-trang", by: "phuocloi", rating: 5, noise: 2, comment: "Chuyên in và đóng quyển luận văn: bìa cứng, gáy keo, in hai mặt đều có. Họ nhắc mình chừa lề trái 3,5 cm để khi đóng không mất chữ.", daysAgo: 10 },
  { loc: "giay-trang", by: "ngocdiep", rating: 5, noise: 2, comment: "Đóng quyển báo cáo đồ án đẹp và chắc, hẹn lấy sau 1 ngày. Giá cao hơn photo thường nhưng xứng đáng.", daysAgo: 4 },

  { loc: "thang-nam", by: "quynhnhu", rating: 3, noise: 3, comment: "Tiệm mới mở, giá tốt nhưng máy in thỉnh thoảng kẹt giấy. Mong chủ tiệm bảo dưỡng máy thường xuyên hơn.", daysAgo: 4 },
];

export interface ShopSpec {
  loc: string;
  owner: PersonKey;
  displayName: string;
  /** Bảng giá (đồng/trang). */
  price: { a4Bw: number; a4Color: number; a3Bw: number; a3Color: number; duplexDiscountPct: number; minOrder: number };
  caps: { color: boolean; duplex: boolean; a3: boolean; binding: boolean };
  accepting: boolean;
  /** Được duyệt cách đây bao nhiêu ngày. */
  approvedDaysAgo: number;
}

export const SHOPS: readonly ShopSpec[] = [
  { loc: "ban-sao-nhanh", owner: "thuhien", displayName: "Bản Sao Nhanh", price: { a4Bw: 500, a4Color: 3000, a3Bw: 1500, a3Color: 8000, duplexDiscountPct: 10, minOrder: 2000 }, caps: { color: true, duplex: true, a3: true, binding: true }, accepting: true, approvedDaysAgo: 16 },
  { loc: "cong-sau", owner: "giahuy", displayName: "In nhanh Cổng Sau", price: { a4Bw: 400, a4Color: 0, a3Bw: 1200, a3Color: 0, duplexDiscountPct: 15, minOrder: 1500 }, caps: { color: false, duplex: true, a3: true, binding: false }, accepting: true, approvedDaysAgo: 14 },
  { loc: "quan-xanh", owner: "duyhung", displayName: "Photocopy Thư Quán Xanh", price: { a4Bw: 450, a4Color: 2500, a3Bw: 0, a3Color: 0, duplexDiscountPct: 10, minOrder: 2000 }, caps: { color: true, duplex: true, a3: false, binding: true }, accepting: true, approvedDaysAgo: 12 },
  { loc: "giay-trang", owner: "phuocloi", displayName: "Giấy Trắng — in & đóng quyển", price: { a4Bw: 600, a4Color: 3500, a3Bw: 1800, a3Color: 9000, duplexDiscountPct: 10, minOrder: 5000 }, caps: { color: true, duplex: true, a3: true, binding: true }, accepting: false, approvedDaysAgo: 10 },
];

export interface OrderSpec {
  /** Khoá ổn định để sinh mã đơn tất định. */
  id: string;
  shop: string;
  by: PersonKey;
  fileName: string;
  pages: number;
  settings: { paper: "A4" | "A3"; color: boolean; copies: number; duplex: boolean; pageRange: string | null; binding: boolean };
  status: "PICKED_UP" | "READY" | "PRINTING" | "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED" | "EXPIRED" | "QUOTED";
  /** Tạo đơn cách đây bao nhiêu ngày. */
  daysAgo: number;
  paid?: boolean;
  note?: string;
}

/** Đơn in — chỉ được tạo khi chủ đơn có sẵn một tệp PDF READY trong DB (mô hình bắt buộc `fileAssetId`; seed không tự tạo tệp). */
export const ORDERS: readonly OrderSpec[] = [
  { id: "thu-ctdl", shop: "ban-sao-nhanh", by: "thu", fileName: "De-cuong-on-thi-CTDL.pdf", pages: 28, settings: { paper: "A4", color: false, copies: 2, duplex: true, pageRange: null, binding: false }, status: "PICKED_UP", daysAgo: 9, paid: true },
  { id: "thu-bao-cao", shop: "giay-trang", by: "thu", fileName: "Bao-cao-do-an-ban-nhap.pdf", pages: 64, settings: { paper: "A4", color: false, copies: 1, duplex: true, pageRange: null, binding: true }, status: "READY", daysAgo: 1 },
  { id: "thu-slide", shop: "quan-xanh", by: "thu", fileName: "Slide-bao-ve-do-an.pdf", pages: 22, settings: { paper: "A4", color: true, copies: 1, duplex: false, pageRange: "1-12", binding: false }, status: "PRINTING", daysAgo: 0 },
  { id: "thu-huy", shop: "cong-sau", by: "thu", fileName: "Bai-tap-giai-tich-tuan-5.pdf", pages: 8, settings: { paper: "A4", color: false, copies: 1, duplex: false, pageRange: null, binding: false }, status: "CANCELLED", daysAgo: 5, note: "Đổi ý, in ở nhà" },
  { id: "khanhlinh-ielts", shop: "ban-sao-nhanh", by: "khanhlinh", fileName: "Academic-Vocabulary-list.pdf", pages: 14, settings: { paper: "A4", color: false, copies: 3, duplex: true, pageRange: null, binding: false }, status: "ACCEPTED", daysAgo: 0 },
  { id: "ngocdiep-slide", shop: "quan-xanh", by: "ngocdiep", fileName: "Poster-do-an-quan-ly-thu-vien.pdf", pages: 4, settings: { paper: "A4", color: true, copies: 5, duplex: false, pageRange: null, binding: false }, status: "PENDING", daysAgo: 0 },
  { id: "ducanh-flyer", shop: "quan-xanh", by: "ducanh", fileName: "To-roi-CLB-front-end.pdf", pages: 2, settings: { paper: "A4", color: true, copies: 20, duplex: true, pageRange: null, binding: false }, status: "REJECTED", daysAgo: 4, note: "Hôm nay tiệm hết mực màu, xin lỗi bạn" },
  { id: "hieutrung-de", shop: "ban-sao-nhanh", by: "hieutrung", fileName: "De-thi-thu-toan-cao-cap.pdf", pages: 6, settings: { paper: "A4", color: false, copies: 1, duplex: false, pageRange: null, binding: false }, status: "EXPIRED", daysAgo: 7 },
];
