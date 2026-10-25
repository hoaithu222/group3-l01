import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizeSearch } from "../src/core/utils/normalize";
import { normalizeEmail } from "../src/core/auth/normalize-email";
import { seedGamification } from "../src/modules/gamification/seed/gamification.seed";
import { seedCareerSkills } from "../src/modules/career/seed/skills.seed";
import { seedCoins } from "../src/modules/coins/seed/coins.seed";
import { seedStudyLessons } from "../src/modules/study/seed/lessons.seed";
import { seedEnglishStudyContent } from "../src/modules/study/seed/english-content.seed";

const prisma = new PrismaClient();

// ─── Dev admin user ──────────────────────────────────────────────────────────
// Base seed tối giản: chỉ tạo 1 tài khoản admin để đăng nhập thử ở môi trường
// dev. Thêm seed nghiệp vụ riêng trong prisma/seeds/ khi module mới cần dữ liệu mẫu.
// SystemConfig CỐ Ý để rỗng — chỉ admin (system-config, Phase 1) mới ghi giá
// trị runtime; seed không tự bịa cấu hình.

const ADMIN_NAME = "Admin";
// Email luôn chuẩn hoá (trim + chữ thường) — đăng nhập tra theo email chuẩn hoá nên seed chữ hoa sẽ không đăng nhập được.
const ADMIN_EMAIL = normalizeEmail(process.env.SEED_ADMIN_EMAIL ?? "admin@superapp.local");
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

async function main() {
  // p4-03 — luật XP + huy hiệu ĐỀ XUẤT (chủ dự án duyệt trước khi bật cờ `gamification`). Idempotent: CHỈ tạo khi thiếu, không ghi đè bản admin đã sửa;
  // khác seed admin nên chạy ở mọi môi trường (dữ liệu vô hại khi cờ tắt).
  const gamification = await seedGamification(prisma);
  console.log(`Seed gamification — luật XP mới: ${gamification.xpRules}, huy hiệu mới: ${gamification.badges}`);
  // p6-06 — 12 kỹ năng ĐỀ XUẤT, tất cả TẮT (vận hành xem trước người đủ điều kiện rồi mới bật). Idempotent theo `code`, không ghi đè bản admin đã sửa.
  const skills = await seedCareerSkills(prisma);
  console.log(`Seed kỹ năng — kỹ năng mới: ${skills}`);
  // p7-02 — luật thưởng xu + nhiệm vụ ngày + vật phẩm cửa hàng ĐỀ XUẤT (chủ dự án duyệt trước khi bật cờ `coins`). Idempotent: chỉ tạo khi thiếu, không ghi đè bản admin đã sửa.
  const coins = await seedCoins(prisma);
  console.log(`Seed coins — luật mới: ${coins.rules}, nhiệm vụ mới: ${coins.quests}, vật phẩm mới: ${coins.items}`);
  // Bộ học công khai (lập trình + tiếng Anh) làm nội dung mẫu cho Trung tâm Học tập. Idempotent theo tag `seed:<slug>`
  // trên StudySet của user hệ thống riêng (không phải admin) — không ghi đè bộ đã tạo.
  const lessons = await seedStudyLessons(prisma);
  console.log(`Seed bài học — bộ học mới: ${lessons.sets}, mục mới: ${lessons.items}`);
  // Nội dung tiếng Anh nhập từ web-study-english (từ vựng, ngữ pháp, luyện tập) — cùng quy ước idempotent với seedStudyLessons ở trên.
  const english = await seedEnglishStudyContent(prisma);
  console.log(`Seed tiếng Anh — bộ học mới: ${english.sets}, mục mới: ${english.items}`);

  if (process.env.NODE_ENV === "production") {
    console.log("Bỏ qua seed admin — NODE_ENV=production (chỉ chạy ở dev/staging).");
    return;
  }
  if (!ADMIN_PASSWORD) {
    console.log("Bỏ qua seed admin — thiếu SEED_ADMIN_PASSWORD trong .env (chỉ dev).");
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      normalizedName: normalizeSearch(ADMIN_NAME),
      role: "admin",
      status: "ACTIVE",
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`Seed xong — admin: ${admin.email} (mật khẩu lấy từ SEED_ADMIN_PASSWORD)`);
}

main()
  .catch((err) => {
    console.error("Seed thất bại:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
