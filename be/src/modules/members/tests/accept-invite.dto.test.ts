import { acceptInviteSchema } from "../dtos";
import { INVITE_REQUEST_MESSAGE_MAX } from "../dtos/create-invite.dto";

/** Body tuỳ chọn của `POST /invites/:token/accept` — `requestMessage` (lời nhắn xin vào nhóm cần duyệt). */
describe("acceptInviteSchema", () => {
  const parse = (body: unknown) => acceptInviteSchema.safeParse(body);

  it("không gửi body / body rỗng / không có requestMessage → hợp lệ, requestMessage undefined (tương thích client cũ)", () => {
    for (const body of [{}, { requestMessage: undefined }]) {
      const r = parse(body);
      expect(r.success).toBe(true);
      expect(r.success && r.data.requestMessage).toBeUndefined();
    }
  });

  it("cắt khoảng trắng đầu/cuối; chuỗi rỗng hoặc toàn khoảng trắng/ký tự điều khiển → undefined (không lưu)", () => {
    expect(parse({ requestMessage: "  Chào anh chị  " })).toMatchObject({ success: true, data: { requestMessage: "Chào anh chị" } });
    for (const blank of ["", "   ", "\t\r\n ", "\u0000\u0007"]) {
      expect(parse({ requestMessage: blank })).toMatchObject({ success: true, data: { requestMessage: undefined } });
    }
  });

  it("bỏ ký tự điều khiển (giữ xuống dòng) và HTML/script; giữ tiếng Việt có dấu, emoji", () => {
    expect(parse({ requestMessage: "Dòng 1\r\nDòng 2\u0007" })).toMatchObject({ data: { requestMessage: "Dòng 1\nDòng 2" } });
    expect(parse({ requestMessage: "Em <b>xin</b> vào <script>alert(1)</script>nhóm" })).toMatchObject({ data: { requestMessage: "Em xin vào nhóm" } });
    expect(parse({ requestMessage: "Mình học Sư phạm Toán 😊" })).toMatchObject({ data: { requestMessage: "Mình học Sư phạm Toán 😊" } });
  });

  it(`tối đa ${INVITE_REQUEST_MESSAGE_MAX} ký tự (cùng trần lời nhắn lời mời); vượt → lỗi; không phải chuỗi → lỗi`, () => {
    expect(INVITE_REQUEST_MESSAGE_MAX).toBe(500);
    expect(parse({ requestMessage: "a".repeat(500) }).success).toBe(true);
    expect(parse({ requestMessage: "a".repeat(501) }).success).toBe(false);
    expect(parse({ requestMessage: 123 }).success).toBe(false);
    expect(parse({ requestMessage: null }).success).toBe(false);
  });

  it("bỏ trường lạ (không lọt vào service)", () => {
    const r = parse({ requestMessage: "ok", role: "OWNER" });
    expect(r.success && Object.keys(r.data)).toEqual(["requestMessage"]);
  });
});
