import { drawEntity } from "./collab-board-dsl";
import type { BoardSpec } from "./collab.types";

/** Bảng trắng của 3 nhóm: CLB Backend, đồ án thư viện, UI/UX. */

export const backendBoards: readonly BoardSpec[] = [
  {
    name: "Kiến trúc API đặt sân thể thao",
    by: "quocbao",
    drawers: ["quocbao", "thu", "duyhung", "mentortuan"],
    daysAgo: 14,
    editedDaysAgo: 3,
    background: "grid",
    history: [{ ratio: 0.5, kind: "MANUAL", label: "Bản duyệt trước khi code", by: "quocbao", daysAgo: 12 }],
    draw(b) {
      b.text("title", 0, -60, "Kiến trúc API đặt sân thể thao", { size: 28 });
      const layers: Array<[string, string, "blue" | "yellow" | "green" | "purple"]> = [
        ["l0", "App / Web client", "blue"],
        ["l1", "Middleware: helmet,\ncors, rate limit", "yellow"],
        ["l2", "Router /api/v1", "blue"],
        ["l3", "Controller", "green"],
        ["l4", "Service (luật nghiệp vụ)", "purple"],
        ["l5", "Repository (Prisma)", "blue"],
      ];
      layers.forEach(([id, text, tone], i) => b.node(id, 0, i * 110, 250, 64, text, { fill: tone, size: 17 }));
      b.node("db", 0, 6 * 110, 250, 70, "MongoDB", { fill: "green", shape: "ellipse" });
      [...layers.map((l) => l[0]), "db"].forEach((id, i, all) => {
        if (i > 0) b.arrow(`v${i}`, all[i - 1], id);
      });
      b.sticky("n1", 330, 100, "Zod kiểm tra body và query,\nJWT xác thực người dùng", "yellow", { w: 230, h: 100, size: 15 });
      b.sticky("n2", 330, 320, "Lỗi trả đồng nhất:\n{ error: { code, message } }", "blue", { w: 230, h: 100, size: 15 });
      b.sticky("n3", 330, 430, "Kiểm tra trùng giờ:\nnewStart < existingEnd\nvà newEnd > existingStart", "red", { w: 230, h: 130, size: 15 });
      b.sticky("n4", 330, 600, "Unique (courtId, startTime)\nlà lớp chặn cuối cùng", "green", { w: 230, h: 100, size: 15 });
      b.text("flow-t", 700, -10, "Luồng đặt sân", { size: 22 });
      const flow = ["Chọn sân và khung giờ", "Kiểm tra còn trống", "Tạo booking PENDING", "Thanh toán (mô phỏng)", "Booking CONFIRMED"];
      flow.forEach((text, i) => {
        b.node(`f${i}`, 700, 40 + i * 110, 250, 64, text, { fill: i === flow.length - 1 ? "green" : "blue", size: 17 });
        if (i > 0) b.arrow(`fa${i}`, `f${i - 1}`, `f${i}`);
      });
      b.node("fx", 1030, 150, 190, 64, "Trùng giờ → 409", { fill: "red", size: 17 });
      b.arrow("fxa", "f1", "fx", { stroke: "red" });
    },
  },
];

export const capstoneBoards: readonly BoardSpec[] = [
  {
    name: "ERD hệ thống quản lý thư viện",
    by: "phuocloi",
    drawers: ["phuocloi", "duyhung", "ngocdiep", "thu"],
    daysAgo: 17,
    editedDaysAgo: 2,
    background: "dots",
    history: [
      { ratio: 0.45, kind: "MANUAL", label: "ERD v1", by: "phuocloi", daysAgo: 15 },
      { ratio: 0.8, kind: "MANUAL", label: "ERD v2 — tách Sach và BanSao", by: "phuocloi", daysAgo: 11 },
    ],
    draw(b) {
      b.text("title", 0, -60, "ERD hệ thống quản lý thư viện", { size: 28 });
      drawEntity(b, "sach", 0, 0, "sach", ["_id", "tieuDe", "tacGiaIds[]", "theLoaiIds[]", "nhaXuatBan", "namXuatBan"], "blue", 230);
      drawEntity(b, "bansao", 330, 0, "banSao", ["_id", "sachId", "maVach (string, unique)", "trangThai", "viTri"], "purple", 230);
      drawEntity(b, "pm", 660, 0, "phieuMuon", ["_id", "docGiaId", "nhanVienId", "ngayMuon", "trangThai", "chiTiet[] (nhúng)"], "green", 230);
      drawEntity(b, "nv", 990, 0, "nhanVien", ["_id", "hoTen", "vaiTro", "email"], "yellow", 230);
      drawEntity(b, "dg", 660, 330, "docGia", ["_id", "maSV (unique)", "hoTen", "lop", "hanThe"], "yellow", 230);
      drawEntity(b, "phat", 330, 330, "phat", ["_id", "phieuMuonId", "lyDo", "soTien", "daThanhToan"], "red", 230);
      drawEntity(b, "tg", 0, 330, "tacGia", ["_id", "ten"], "green", 230);
      drawEntity(b, "tl", -300, 80, "theLoai", ["_id", "ten"], "green", 200);
      const rel = (id: string, from: string, to: string, left: string, right: string, dy = -16) => {
        b.arrow(id, from, to);
        b.tag(`${id}-a`, id, left, { at: 0.12, dy });
        b.tag(`${id}-b`, id, right, { at: 0.88, dy });
      };
      rel("r1", "sach", "bansao", "1", "N");
      rel("r2", "pm", "bansao", "N", "N", 18);
      rel("r3", "dg", "pm", "1", "N", 0);
      rel("r4", "nv", "pm", "1", "N");
      rel("r5", "pm", "phat", "1", "N", 18);
      rel("r6", "tg", "sach", "N", "N", 0);
      rel("r7", "tl", "sach", "N", "N");
      b.sticky("s1", 330, 520, "chiTiet[] nhúng trong phieuMuon: { banSaoId, tenSach, ngayHenTra, ngayTra }\ntối đa 5 phần tử", "yellow", { w: 330, h: 110, size: 15 });
      b.sticky("s2", 700, 520, "Index: text(sach.tieuDe), banSao.maVach unique,\ndocGia.maSV unique, phieuMuon(docGiaId, trangThai)", "blue", { w: 330, h: 110, size: 15 });
    },
  },
  {
    name: "Luồng mượn – trả sách",
    by: "ngocdiep",
    drawers: ["ngocdiep", "thu", "phuongthao", "duyhung"],
    daysAgo: 10,
    editedDaysAgo: 3,
    background: "grid",
    history: [{ ratio: 0.55, kind: "AUTO", daysAgo: 6 }],
    draw(b) {
      b.text("title", 0, -60, "Luồng mượn – trả sách", { size: 28 });
      b.node("m1", 0, 0, 220, 64, "Độc giả đưa thẻ / mã SV", { fill: "blue", size: 16 });
      b.node("m2", 280, 0, 220, 64, "Thủ thư quét mã vạch\ntừng cuốn", { fill: "blue", size: 16 });
      b.node("m3", 560, -10, 270, 84, "Thẻ còn hạn, ≤ 5 cuốn,\nkhông nợ phạt?", { fill: "yellow", size: 16 });
      b.node("m4", 910, 0, 220, 64, "Từ chối, báo lý do", { fill: "red", size: 16 });
      b.node("m5", 560, 160, 270, 76, "Tạo phiếu mượn\n(transaction: bản sao + phiếu)", { fill: "green", size: 16 });
      b.node("m6", 560, 310, 270, 64, "Hẹn ngày trả theo quy định", { fill: "green", size: 16 });
      b.arrow("ma", "m1", "m2");
      b.arrow("mb", "m2", "m3");
      b.arrow("mc", "m3", "m4", { stroke: "red" });
      b.tag("mc-t", "mc", "Không", { dy: -16, stroke: "red" });
      b.arrow("md", "m3", "m5", { stroke: "green" });
      b.tag("md-t", "md", "Đạt", { dx: 28, stroke: "green" });
      b.arrow("me", "m5", "m6");
      b.node("t1", 0, 480, 230, 64, "Quét mã vạch bản sao\nđược trả", { fill: "blue", size: 16 });
      b.node("t2", 300, 470, 250, 84, "Trả đúng hạn?", { fill: "yellow", size: 18 });
      b.node("t3", 640, 480, 230, 64, "Bản sao: CÓ SẴN", { fill: "green", size: 16 });
      b.node("t4", 300, 640, 250, 76, "Tính phạt: số ngày trễ\n× mức phạt/ngày", { fill: "red", size: 16 });
      b.node("t5", 640, 650, 230, 64, "Ghi collection phat", { fill: "purple", size: 16 });
      b.arrow("ta", "t1", "t2");
      b.arrow("tb", "t2", "t3", { stroke: "green" });
      b.tag("tb-t", "tb", "Đúng", { dy: -16, stroke: "green" });
      b.arrow("tc", "t2", "t4", { stroke: "red" });
      b.tag("tc-t", "tc", "Trễ", { dx: 26, stroke: "red" });
      b.arrow("td", "t4", "t5");
      b.arrow("te", "t5", "t3");
      b.sticky("s-note", 940, 470, "Có thể miễn hoặc giảm phạt,\nbắt buộc ghi lý do.", "yellow", { w: 210, h: 120, size: 15 });
    },
  },
];

export const uiuxBoards: readonly BoardSpec[] = [
  {
    name: "User journey – nhận và làm việc nhóm",
    by: "thuytrang",
    drawers: ["thuytrang", "thaonguyen", "thu", "khanhlinh"],
    daysAgo: 12,
    editedDaysAgo: 3,
    background: "plain",
    history: [{ ratio: 0.5, kind: "MANUAL", label: "Bản nộp critique", by: "thuytrang", daysAgo: 9 }],
    draw(b) {
      const stages = ["Mở app", "Xem việc hôm nay", "Nhận việc", "Làm và cập nhật", "Nhận nhắc"];
      const rows: Array<[string, "yellow" | "blue" | "green" | "purple", string[]]> = [
        ["Hành động", "yellow", ["Mở app, vào Home", "Lướt danh sách việc theo hạn", "Bấm Nhận việc trên thẻ", "Kéo thẻ sang Đang làm, tick checklist", "Nhận nhắc trước hạn 1 ngày"]],
        ["Suy nghĩ", "blue", ["Hôm nay mình phải làm gì nhỉ?", "Việc nào gấp nhất?", "Mình làm được trong tuần này", "Mong cả nhóm thấy tiến độ", "Nhờ nhắc mà kịp deadline"]],
        ["Cảm xúc", "green", ["Hơi rối vì nhiều nhóm", "Nhẹ nhõm khi thấy rõ", "Có động lực", "Hơi ngại phải mở lại bảng", "Yên tâm"]],
        ["Cơ hội", "purple", ["Thẻ \"Việc hôm nay\" đặt trên cùng", "Sắp xếp theo hạn, nhãn màu cho việc gấp", "Nhận việc chỉ với 2 chạm", "Cập nhật nhanh ngay từ thông báo", "Cho chọn giờ nhắc"]],
      ];
      b.text("title", 0, -70, "User journey – nhận và làm việc nhóm", { size: 28 });
      stages.forEach((name, i) => b.node(`h${i}`, 150 + i * 190, 0, 170, 46, name, { fill: "ink", stroke: "ink", size: 16 }));
      rows.forEach(([name, tone, cells], r) => {
        b.text(`rl${r}`, 0, 70 + r * 150 + 40, name, { size: 18 });
        cells.forEach((text, i) => b.sticky(`c${r}${i}`, 150 + i * 190, 66 + r * 150, text, tone, { w: 170, h: 126, size: 15 }));
      });
    },
  },
  {
    name: "Affinity map – kết quả phỏng vấn",
    by: "thaonguyen",
    visibility: "PRIVATE",
    collab: [["thuytrang", "EDITOR"], ["thu", "EDITOR"], ["khanhlinh", "VIEWER"]],
    drawers: ["thaonguyen", "thuytrang", "thu"],
    daysAgo: 9,
    editedDaysAgo: 4,
    background: "dots",
    draw(b) {
      const clusters: Array<[string, "yellow" | "red" | "green", string[]]> = [
        ["Công cụ rời rạc", "yellow", ["Chat một nơi, bảng tính một nơi", "Không biết ai đang làm gì", "File nằm rải rác trong chat", "Phải hỏi lại tiến độ nhiều lần"]],
        ["Hay quên deadline", "red", ["Nhắc việc lẫn trong tin nhắn", "Sát hạn mới thấy", "Muốn được nhắc trước 1 ngày", "Không muốn bị nhắc quá nhiều"]],
        ["Điều người dùng mong muốn", "green", ["Thấy ngay việc hôm nay", "Tạo việc mới trong 2 chạm", "Nhìn được tiến độ cả nhóm", "Dùng thoải mái trên điện thoại"]],
      ];
      clusters.forEach(([name, tone, notes], c) => {
        const x = c * 400;
        b.node(`ch${c}`, x, 0, 360, 52, name, { fill: tone, size: 20 });
        notes.forEach((text, i) => b.sticky(`n${c}${i}`, x + (i % 2) * 190, 80 + Math.floor(i / 2) * 170, text, tone, { w: 170, h: 150, size: 16 }));
      });
      b.text("insight", 0, 440, "Insight: người dùng cần MỘT nơi thấy việc hôm nay + nhắc đúng lúc.", { size: 22, stroke: "purple" });
    },
  },
];
