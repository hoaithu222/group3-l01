import {
  emailSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "../dtos/auth.dto";
import { changePasswordSchema } from "../dtos/change-password.dto";

const NONCE = "a".repeat(32);

describe("emailSchema — chuẩn hoá ngay ở DTO", () => {
  it("cắt khoảng trắng + chữ thường", () => {
    expect(emailSchema.parse("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
  });

  it("từ chối email sai định dạng và email quá 254 ký tự", () => {
    expect(emailSchema.safeParse("khong-phai-email").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(250)}@e.com`).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("chuẩn hoá email, KHÔNG áp luật độ mạnh mật khẩu (tài khoản cũ có mật khẩu ngắn vẫn đăng nhập được)", () => {
    const parsed = loginSchema.parse({ email: "A@B.com", password: "123", nonce: NONCE });

    expect(parsed.email).toBe("a@b.com");
    expect(parsed.password).toBe("123");
  });

  it("mật khẩu rỗng hoặc dài hơn 128 ký tự ⇒ từ chối; nonce sai định dạng ⇒ từ chối", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "", nonce: NONCE }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(129), nonce: NONCE }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x", nonce: "ngan" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(false);
  });

  it("giữ nguyên mật khẩu byte-for-byte (không trim, không đổi hoa/thường)", () => {
    const password = "  Mat Khau <b>Có Dấu</b> & \"'  ";

    expect(loginSchema.parse({ email: "a@b.com", password, nonce: NONCE }).password).toBe(password);
  });
});

describe("registerSchema", () => {
  const valid = { email: "moi@example.com", name: "Người Mới", password: "matkhau-8+", nonce: NONCE };

  it("hợp lệ ⇒ chuẩn hoá email, cắt tên", () => {
    const parsed = registerSchema.parse({ ...valid, email: " Moi@Example.com", name: "  Người Mới  " });

    expect(parsed).toMatchObject({ email: "moi@example.com", name: "Người Mới" });
  });

  it("SEC-01: gửi `role` (hoặc trường lạ bất kỳ) ⇒ từ chối (.strict())", () => {
    expect(registerSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it("mật khẩu 8–128 ký tự: 7 ký tự ⇒ từ chối, 8 ⇒ nhận, 128 ⇒ nhận, 129 ⇒ từ chối", () => {
    expect(registerSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "12345678" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: "a".repeat(128) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: "a".repeat(129) }).success).toBe(false);
  });

  it("tên rỗng/toàn khoảng trắng hoặc quá 80 ký tự ⇒ từ chối", () => {
    expect(registerSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, name: "a".repeat(81) }).success).toBe(false);
  });

  describe("phone (tuỳ chọn, tự khai)", () => {
    it("không gửi ⇒ hợp lệ, không có phone", () => {
      expect(registerSchema.parse(valid).phone).toBeUndefined();
    });

    it("chuẩn hoá về E.164 ngay ở DTO", () => {
      expect(registerSchema.parse({ ...valid, phone: "0912 345 678" }).phone).toBe("+84912345678");
      expect(registerSchema.parse({ ...valid, phone: "+84 912.345.678" }).phone).toBe("+84912345678");
    });

    it("chuỗi rỗng/khoảng trắng (ô để trống trên form di động) ⇒ coi như không gửi, KHÔNG lỗi", () => {
      expect(registerSchema.parse({ ...valid, phone: "" }).phone).toBeUndefined();
      expect(registerSchema.parse({ ...valid, phone: "   " }).phone).toBeUndefined();
    });

    it("sai hình dạng ⇒ từ chối (400 VAL_001 ở route)", () => {
      for (const phone of ["abc", "0912", "0112345678", "0912345678 ext 1"]) {
        expect(registerSchema.safeParse({ ...valid, phone }).success).toBe(false);
      }
    });
  });
});

describe("forgot/reset password", () => {
  it("forgotPasswordSchema chuẩn hoá email", () => {
    expect(forgotPasswordSchema.parse({ email: " X@Y.com " }).email).toBe("x@y.com");
  });

  it("resetPasswordSchema: mật khẩu mới ≥ 8 và ≤ 128; token không rỗng và ≤ 256 ký tự", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", newPassword: "1234567" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t", newPassword: "12345678" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "", newPassword: "12345678" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t".repeat(257), newPassword: "12345678" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("CÙNG luật mật khẩu mới với đăng ký/đặt lại (8–128, không bắt buộc chữ + số); refreshToken tuỳ chọn", () => {
    const ok = { currentPassword: "cu", newPassword: "moi12345" };

    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    // Một chính sách chung (p0-01 be.md §3): mật khẩu đăng ký được thì đổi sang cũng được.
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "chiChuCai" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "12345678" }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "chiChuCai", nonce: NONCE }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "ngan123" }).success).toBe(false); // 7 ký tự
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "b".repeat(129) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: "b".repeat(128) }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: "c".repeat(129) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, refreshToken: "tok" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, refreshToken: "" }).success).toBe(false);
  });
});

describe("refreshTokenSchema", () => {
  it("token không rỗng, tối đa 4096 ký tự", () => {
    expect(refreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(false);
    expect(refreshTokenSchema.safeParse({ refreshToken: "x".repeat(4097) }).success).toBe(false);
    expect(refreshTokenSchema.safeParse({ refreshToken: "x" }).success).toBe(true);
  });
});
