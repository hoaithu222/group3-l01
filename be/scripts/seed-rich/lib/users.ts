import bcrypt from "bcryptjs";
import { normalizeSearch } from "../../../src/core/utils/normalize";
import { normalizeEmail } from "../../../src/core/auth/normalize-email";
import { PEOPLE, SEED_PASSWORD, THU_EMAIL, THU_KEY, emailOf } from "../people";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";

/**
 * Tạo (nếu chưa có) toàn bộ người dùng mẫu, cùng một mật khẩu `SEED_PASSWORD`; KHÔNG bao giờ sửa người đã tồn tại.
 * `thu` là tài khoản thật — phải có sẵn, không tạo ở đây.
 */
export async function ensureUsers(dir: Directory, now: Date): Promise<{ created: number }> {
  const thu = await prisma.user.findUnique({ where: { email: normalizeEmail(THU_EMAIL) } });
  if (!thu) throw new Error(`Không tìm thấy tài khoản ${THU_EMAIL} — hãy đăng ký tài khoản này trước khi seed.`);
  dir.set(THU_KEY, thu.id, thu.name);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  let created = 0;
  for (const person of PEOPLE) {
    const email = normalizeEmail(emailOf(person.key));
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const rng = rngFrom(`user:${person.key}`);
      // Đăng ký rải trong 12–24 ngày trước, để tên mẫu không trùng đúng một thời điểm.
      const createdAt = new Date(now.getTime() - (12 + Math.floor(rng() * 12)) * DAY_MS - Math.floor(rng() * DAY_MS));
      user = await prisma.user.create({
        data: {
          email,
          name: person.name,
          normalizedName: normalizeSearch(person.name),
          role: "user",
          status: "ACTIVE",
          passwordHash,
          passwordChangedAt: createdAt,
          emailVerified: true,
          emailVerifiedAt: createdAt,
          createdAt,
        },
      });
      created += 1;
    }
    dir.set(person.key, user.id, user.name);
  }
  return { created };
}
