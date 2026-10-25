import type { PrismaClient } from "@prisma/client";
import { normalizeSearch, normalizeSkillLabel } from "../../../core/utils/normalize";
import { skillCriteriaSchema, toStoredCriteria, type SkillCriteriaInput } from "../../../shared/criteria/skill-criteria";
import type { SkillCategory } from "../entities/skill.interface";

/**
 * Seed ĐỀ XUẤT 12 kỹ năng mặc định của p6-06 (README §7) — TẤT CẢ `isActive=false`: vận hành xem trước số người đủ điều kiện rồi mới bật (CR-27).
 * Idempotent theo `code`: CHỈ TẠO khi thiếu, KHÔNG ghi đè bản admin đã sửa. Chạy qua `npm run db:seed` (`prisma/seed.ts`) — dữ liệu vô hại khi cờ
 * `career` tắt. Icon là tên trong bộ icon hệ thống của app (`<Icon name>`); thiếu → app dùng icon mặc định.
 */
export interface SkillSeed {
  code: string;
  name: string;
  description: string;
  category: SkillCategory;
  labels: string[];
  icon: string;
  order: number;
  criteria: SkillCriteriaInput;
}

const STD: SkillCriteriaInput = { requiredTasksDone: 30, minStoryPoints: 60, minAvgPeerScore: 7.5, requireReview: false };

export const SKILL_SEEDS: readonly SkillSeed[] = [
  { code: "reactjs", name: "ReactJS", description: "Xây dựng giao diện web bằng React", category: "FRONTEND", labels: ["ReactJS", "React", "React JS"], icon: "keyboard", order: 10, criteria: STD },
  { code: "react-native", name: "React Native", description: "Phát triển ứng dụng di động đa nền tảng", category: "MOBILE", labels: ["React Native", "RN", "Mobile"], icon: "phone", order: 20, criteria: STD },
  { code: "nodejs", name: "Node.js", description: "Xây dựng API và dịch vụ phía máy chủ bằng Node.js", category: "BACKEND", labels: ["Node.js", "NodeJS", "Express", "Backend"], icon: "service", order: 30, criteria: STD },
  { code: "database-design", name: "Database Design", description: "Thiết kế lược đồ, chỉ mục và truy vấn dữ liệu", category: "DATA", labels: ["Database", "Cơ sở dữ liệu", "SQL", "MongoDB"], icon: "document-2", order: 40, criteria: STD },
  { code: "ui-ux-design", name: "UI/UX Design", description: "Thiết kế trải nghiệm và giao diện người dùng", category: "DESIGN", labels: ["UI/UX", "UI", "UX", "Thiết kế", "Figma"], icon: "magic-wand-01", order: 50, criteria: STD },
  { code: "testing", name: "Testing", description: "Viết kiểm thử và bảo đảm chất lượng", category: "QA", labels: ["Testing", "Test", "QA", "Kiểm thử"], icon: "checkmark-circle", order: 60, criteria: STD },
  { code: "devops", name: "DevOps", description: "Triển khai, CI/CD và vận hành hệ thống", category: "DEVOPS", labels: ["DevOps", "CI/CD", "Docker", "Deploy"], icon: "wrench-01", order: 70, criteria: STD },
  { code: "python", name: "Python", description: "Lập trình và xử lý dữ liệu bằng Python", category: "BACKEND", labels: ["Python"], icon: "keyboard", order: 80, criteria: STD },
  { code: "java-spring-boot", name: "Java/Spring Boot", description: "Phát triển dịch vụ bằng Java và Spring Boot", category: "BACKEND", labels: ["Java", "Spring Boot", "Spring"], icon: "setting", order: 90, criteria: STD },
  { code: "data-analysis", name: "Data Analysis", description: "Phân tích và trực quan hoá dữ liệu", category: "DATA", labels: ["Data Analysis", "Phân tích dữ liệu", "Data"], icon: "analytics-02", order: 100, criteria: STD },
  { code: "documentation", name: "Documentation", description: "Viết tài liệu kỹ thuật và báo cáo", category: "SOFT", labels: ["Documentation", "Docs", "Tài liệu", "Báo cáo"], icon: "book", order: 110, criteria: { requiredTasksDone: 20, minStoryPoints: 30, minAvgPeerScore: 7.5, requireReview: false } },
  { code: "leadership", name: "Leadership", description: "Dẫn dắt, điều phối công việc của nhóm", category: "SOFT", labels: ["lead", "truong-nhom", "Trưởng nhóm", "Leader"], icon: "add-team", order: 120, criteria: { requiredTasksDone: 20, minStoryPoints: 40, minAvgPeerScore: 8, requireReview: true } },
];

/** Tạo kỹ năng còn thiếu (theo `code`). Trả số kỹ năng MỚI tạo. Nhận `PrismaClient` của script (không dùng singleton ứng dụng). */
export async function seedCareerSkills(prisma: PrismaClient): Promise<number> {
  const have = new Set((await prisma.skillDefinition.findMany({ select: { code: true } })).map((s) => s.code));
  let created = 0;
  for (const s of SKILL_SEEDS.filter((x) => !have.has(x.code))) {
    const criteria = toStoredCriteria(skillCriteriaSchema.parse(s.criteria));
    await prisma.skillDefinition.create({
      data: {
        code: s.code,
        name: s.name,
        normalizedName: normalizeSearch(s.name),
        description: s.description,
        category: s.category,
        labelMatch: [...new Set(s.labels.map(normalizeSkillLabel).filter(Boolean))],
        criteria,
        icon: s.icon,
        isActive: false,
        order: s.order,
        createdBy: null,
        updatedBy: null,
      },
    });
    created += 1;
  }
  return created;
}
