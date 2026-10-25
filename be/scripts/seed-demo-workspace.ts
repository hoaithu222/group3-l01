#!/usr/bin/env ts-node
/**
 * ============================================================================
 * SEED workspace demo (nhóm mẫu) — theo yêu cầu riêng, cho 1 tài khoản
 * ============================================================================
 *
 * Tạo 1 Workspace ("Dự án nhóm (mẫu)") cho user `OWNER_EMAIL`: 2 kênh (Chung + Dự án) kèm vài tin nhắn chào mừng, 1 bảng
 * Kanban kiểu Scrum nhẹ (5 cột, 5 nhãn — theo đúng mẫu `LIGHT_SCRUM` ở board-templates.ts) và 10 thẻ mẫu rải đều các cột.
 *
 * KHÔNG nằm trong `npm run db:seed` — script này gắn với MỘT tài khoản cụ thể (không hợp lý chạy ở môi trường/tài khoản
 * khác), giống cách `seed-workspace-templates.ts` tách riêng. Idempotent theo `ownerId + normalizedName` của workspace:
 * chạy lại khi đã có thì bỏ qua toàn bộ, không tạo trùng.
 *
 * Sử dụng: npm run db:seed:demo-workspace
 * ============================================================================
 */
import { PrismaClient } from "@prisma/client";
import { normalizeSearch } from "../src/core/utils/normalize";
import { nanoid } from "../src/core/utils/nanoid";
import { LABEL_COLOR_TOKENS } from "../src/core/constants/project";
import { evenKeys } from "../src/modules/projects/services/task-position";

const prisma = new PrismaClient();

const OWNER_EMAIL = "thu601925@gmail.com";
const WORKSPACE_NAME = "Dự án nhóm (mẫu)";

const COLUMNS = [
  { title: "Backlog", kind: "TODO" as const },
  { title: "Sprint", kind: "TODO" as const },
  { title: "Đang làm", kind: "IN_PROGRESS" as const },
  { title: "Kiểm thử", kind: "REVIEW" as const },
  { title: "Hoàn thành", kind: "DONE" as const },
];

const LABELS: { name: string; color: (typeof LABEL_COLOR_TOKENS)[number] }[] = [
  { name: "Tính năng", color: "green" },
  { name: "Lỗi", color: "red" },
  { name: "Cải tiến", color: "blue" },
  { name: "Kỹ thuật", color: "purple" },
  { name: "Tài liệu", color: "gray" },
];

interface TaskSeed {
  column: number;
  title: string;
  label?: string;
  description?: string;
  done?: boolean;
}

const TASKS: readonly TaskSeed[] = [
  { column: 0, title: "Nghiên cứu nhu cầu người dùng cho tính năng mới", label: "Tính năng", description: "Khảo sát nhanh 5–10 người dùng để chọn hướng ưu tiên." },
  { column: 0, title: "Viết tài liệu hướng dẫn sử dụng", label: "Tài liệu" },
  { column: 1, title: "Thiết kế giao diện màn hình Hồ sơ", label: "Tính năng" },
  { column: 1, title: "Sửa lỗi không tải được ảnh đại diện", label: "Lỗi", description: "Lỗi xảy ra khi ảnh > 5MB, cần nén trước khi upload." },
  { column: 2, title: "Xây dựng API tìm kiếm", label: "Kỹ thuật" },
  { column: 2, title: "Tối ưu tốc độ tải trang chủ", label: "Cải tiến" },
  { column: 3, title: "Kiểm thử luồng thanh toán", label: "Lỗi" },
  { column: 3, title: "Review code module thông báo", label: "Kỹ thuật" },
  { column: 4, title: "Phát hành phiên bản 1.2.0", label: "Tính năng", done: true },
  { column: 4, title: "Cập nhật changelog", label: "Tài liệu", done: true },
];

const WELCOME_MESSAGES = [
  "Chào mừng đến với không gian làm việc nhóm! 👋",
  "Mình vừa thêm bảng công việc mẫu — mọi người xem thử nhé.",
  "Cần thêm gì thì cứ báo mình trong kênh này.",
];

async function main(): Promise<void> {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    console.log(`Bỏ qua — không tìm thấy user với email ${OWNER_EMAIL}.`);
    return;
  }

  const normalizedName = normalizeSearch(WORKSPACE_NAME);
  const already = await prisma.workspace.findFirst({ where: { ownerId: owner.id, normalizedName } });
  if (already) {
    console.log(`Bỏ qua — workspace "${WORKSPACE_NAME}" đã tồn tại (id ${already.id}).`);
    return;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: WORKSPACE_NAME,
      normalizedName,
      ownerId: owner.id,
      description: "Không gian làm việc mẫu — bảng công việc + kênh chat để xem trực quan.",
    },
  });
  await prisma.workspaceMembership.create({ data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" } });

  // ── Kênh ──
  const general = await prisma.channel.create({
    data: { workspaceId: workspace.id, name: "Chung", normalizedName: normalizeSearch("Chung"), createdBy: owner.id, isDefault: true },
  });
  await prisma.channelMembership.create({ data: { channelId: general.id, workspaceId: workspace.id, userId: owner.id } });
  await prisma.workspace.update({ where: { id: workspace.id }, data: { defaultChannelId: general.id } });

  const projectChannel = await prisma.channel.create({
    data: { workspaceId: workspace.id, name: "Dự án", normalizedName: normalizeSearch("Dự án"), createdBy: owner.id, position: 1 },
  });
  await prisma.channelMembership.create({ data: { channelId: projectChannel.id, workspaceId: workspace.id, userId: owner.id } });

  // ── Tin nhắn chào mừng trong kênh Chung ──
  const now = Date.now();
  let seq = 0;
  let lastMessageId = "";
  for (const text of WELCOME_MESSAGES) {
    seq += 1;
    const msg = await prisma.message.create({
      data: {
        scopeType: "CHANNEL",
        scopeId: general.id,
        workspaceId: workspace.id,
        seq,
        authorId: owner.id,
        content: text,
        normalizedContent: normalizeSearch(text),
        dedupeKey: `u:${owner.id}:${nanoid(12)}`,
        createdAt: new Date(now - (WELCOME_MESSAGES.length - seq) * 60_000),
        // Quy ước Mongo null-vs-absent (message.repository.prisma.ts#create) — ghi null tường minh cho field các thao
        // tác sau này (sửa/ghim/xoá) lọc bằng `{field: null}`.
        deletedAt: null,
        deletedBy: null,
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
      },
    });
    lastMessageId = msg.id;
  }
  await prisma.channel.update({ where: { id: general.id }, data: { lastSeq: seq, lastMessageAt: new Date(), lastMessageId, memberCount: 1 } });
  await prisma.channel.update({ where: { id: projectChannel.id }, data: { memberCount: 1 } });
  // `nextSeq()` (message.repository.prisma.ts) tăng Counter `msg:<scopeType>:<scopeId>:<threadKey>` — thiếu counter thì
  // tin nhắn THẬT đầu tiên người dùng gửi trong kênh "Chung" sẽ upsert seq bắt đầu từ 1, trùng seq đã seed ở trên.
  await prisma.counter.create({ data: { key: `msg:CHANNEL:${general.id}:root`, seq } });

  // ── Bảng Kanban (Scrum nhẹ) ──
  const boardName = "Công việc chính";
  const columns = COLUMNS.map((c, i) => ({ id: `c_${nanoid(8)}`, title: c.title, kind: c.kind, order: i }));
  const board = await prisma.board.create({
    // Quy ước Mongo null-vs-absent (board.repository.prisma.ts#create): `archivedAt: null` phải ghi tường minh — danh
    // sách bảng lọc `archivedAt: null` không điều kiện, thiếu field thì bảng bị loại khỏi mọi danh sách.
    data: { workspaceId: workspace.id, name: boardName, normalizedName: normalizeSearch(boardName), columns, createdBy: owner.id, archivedAt: null },
  });

  const labelIdByName = new Map<string, string>();
  for (const l of LABELS) {
    const label = await prisma.label.create({
      data: { boardId: board.id, workspaceId: workspace.id, name: l.name, normalizedName: normalizeSearch(l.name), color: l.color },
    });
    labelIdByName.set(l.name, label.id);
  }

  // ── Thẻ công việc — rải đều theo cột bằng fractional index ──
  const tasksByColumn = new Map<number, TaskSeed[]>();
  for (const t of TASKS) tasksByColumn.set(t.column, [...(tasksByColumn.get(t.column) ?? []), t]);

  for (const [colIndex, tasks] of tasksByColumn) {
    const col = columns[colIndex];
    const positions = evenKeys(tasks.length);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await prisma.task.create({
        data: {
          boardId: board.id,
          workspaceId: workspace.id,
          columnId: col.id,
          columnKind: col.kind,
          position: positions[i],
          title: t.title,
          normalizedTitle: normalizeSearch(t.title),
          description: t.description ?? null,
          labelIds: t.label ? [labelIdByName.get(t.label) as string] : [],
          assigneeIds: [owner.id],
          createdBy: owner.id,
          completedAt: t.done ? new Date() : null,
          completionCount: t.done ? 1 : 0,
          startDate: null,
          storyPoints: null,
          // Quy ước Mongo null-vs-absent (task.repository.prisma.ts#create): ghi null tường minh như thẻ tạo qua API — Prisma chỉ
          // khớp `{field: null}` với null THẬT (trường vắng thì không), thiếu field thì thẻ mẫu lệch khỏi thẻ thường khi lọc/đếm.
          dueDate: null,
          clientTaskId: null,
          // Quy ước Mongo null-vs-absent (task.repository.prisma.ts#create): 3 field này phải ghi null tường minh —
          // list bảng/thống kê lọc `deletedAt: null` không điều kiện, thiếu field thì thẻ bị loại khỏi mọi danh sách.
          deletedFromColumnId: null,
          deletedAt: null,
          deletedBy: null,
        },
      });
    }
  }

  console.log(
    `Đã tạo workspace demo "${WORKSPACE_NAME}" (id ${workspace.id}) cho ${owner.email}: 2 kênh, ${WELCOME_MESSAGES.length} tin nhắn, 1 bảng, ${LABELS.length} nhãn, ${TASKS.length} thẻ.`
  );
}

main()
  .catch((err) => {
    console.error("Seed demo workspace thất bại:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
