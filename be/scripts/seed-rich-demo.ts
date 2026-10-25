#!/usr/bin/env ts-node
/**
 * ============================================================================
 * SEED dữ liệu mẫu "nhóm đông người" — 36 người dùng, 8 nhóm làm việc cùng chủ đề học tập/dự án
 * ============================================================================
 *
 * Tạo (hoặc bổ sung vào nhóm đã có của `thu601925@gmail.com`):
 *   · 36 tài khoản mẫu `<khoá>@seed.superapp.local`, mật khẩu chung `123456aA@` (xem `seed-rich/people.ts`)
 *   · 8 nhóm: front-end, toán cao cấp, dự án ứng dụng, IELTS, CTDL&GT, CLB Backend, đồ án thư viện, UI/UX — mỗi nhóm
 *     có thành viên theo vai trò, yêu cầu xin vào/lời mời đang chờ, kênh công khai/riêng tư/thoại, hội thoại (trả lời,
 *     nhắc tên, cảm xúc, ghim, khảo sát, luồng), bảng Kanban (nhãn, thẻ, checklist, bình luận), bộ học và quỹ nhóm
 *   · tin nhắn 1-1 của `thu` với 9 người + 4 nhóm chat; hộp thư thông báo; số liệu hoạt động theo ngày
 *
 * Idempotent: chạy lại không tạo trùng (tin/thẻ/bộ học/khoản chi nhận diện bằng khoá ổn định) và KHÔNG ghi đè dữ liệu người dùng
 * đã đổi; chỉ bổ sung. KHÔNG nằm trong `npm run db:seed`.
 *
 * ⚠ Ghi vào DB mà `DATABASE_URL` trỏ tới — máy dev dùng chung Atlas với Railway. Chạy ở NODE_ENV=production bị chặn
 * (tài khoản mẫu dùng mật khẩu công khai), trừ khi thêm `--allow-production`.
 *
 * Sử dụng:
 *   npm run db:seed:rich-demo              # seed thật
 *   npm run db:seed:rich-demo -- --check   # chỉ kiểm tra nội dung (không kết nối DB)
 *   npm run db:seed:rich-demo -- --only=ielts,dsa   # chỉ vài nhóm (khoá nhóm), vẫn tạo người dùng
 * ============================================================================
 */
import fs from "fs";
import path from "path";
import { spec as appdev } from "./seed-rich/content/appdev";
import { spec as backend } from "./seed-rich/content/backend";
import { spec as capstone } from "./seed-rich/content/capstone";
import { dms, groupChats } from "./seed-rich/content/conversations";
import { spec as dsa } from "./seed-rich/content/dsa";
import { spec as frontend } from "./seed-rich/content/frontend";
import { spec as ielts } from "./seed-rich/content/ielts";
import { spec as math } from "./seed-rich/content/math";
import { spec as uiux } from "./seed-rich/content/uiux";
import type { WorkspaceSpec } from "./seed-rich/types";
import { seedBoards, type SeededTask } from "./seed-rich/lib/boards";
import { ensureChannels } from "./seed-rich/lib/channels";
import { seedChannelMessages, type SeededChannel } from "./seed-rich/lib/chat";
import { seedDirectMessages, seedGroupChats, type SeededConversation } from "./seed-rich/lib/conversations";
import { Directory, prisma } from "./seed-rich/lib/core";
import { seedThuNotifications } from "./seed-rich/lib/notify";
import type { ModuleCtx, ModuleSeed } from "./seed-rich/lib/module-ctx";
import { seedWorkspaceStats } from "./seed-rich/lib/stats";
import { seedStudySets } from "./seed-rich/lib/study";
import { seedXp } from "./seed-rich/lib/xp";
import { ensureUsers } from "./seed-rich/lib/users";
import { validateSpecs } from "./seed-rich/lib/validate";
import { seedWallet, type SeededExpense } from "./seed-rich/lib/wallet";
import { ensureWorkspace, refreshCounts, type WorkspaceCtx } from "./seed-rich/lib/workspace";

const ALL_SPECS: readonly WorkspaceSpec[] = [frontend, math, appdev, ielts, dsa, backend, capstone, uiux];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  const m = url.match(/@([^/?]+)/);
  return m ? m[1] : "(không rõ)";
}

async function main(): Promise<void> {
  const errors = validateSpecs(ALL_SPECS, dms, groupChats);
  if (errors.length > 0) {
    console.error(`Nội dung seed có ${errors.length} lỗi:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  const stats = ALL_SPECS.reduce(
    (a, s) => ({
      lines: a.lines + s.channels.reduce((n, c) => n + (c.lines?.length ?? 0), 0),
      tasks: a.tasks + s.boards.reduce((n, b) => n + b.tasks.length, 0),
      items: a.items + s.studySets.reduce((n, st) => n + st.items.length, 0),
    }),
    { lines: 0, tasks: 0, items: 0 }
  );
  console.log(`Nội dung hợp lệ: ${ALL_SPECS.length} nhóm, ${stats.lines} tin kênh, ${stats.tasks} thẻ, ${stats.items} mục học, ${dms.length} DM, ${groupChats.length} nhóm chat.`);
  if (arg("check") !== undefined) return;

  if (process.env.NODE_ENV === "production" && arg("allow-production") === undefined) {
    console.log("Bỏ qua — NODE_ENV=production (tài khoản mẫu dùng mật khẩu công khai). Thêm --allow-production nếu thật sự muốn.");
    return;
  }

  const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const specs = only && only.length > 0 ? ALL_SPECS.filter((s) => only.includes(s.key)) : ALL_SPECS;
  if (only && only.length > 0 && specs.length !== only.length) {
    console.error(`--only: có khoá nhóm không tồn tại (có: ${ALL_SPECS.map((s) => s.key).join(", ")})`);
    process.exitCode = 1;
    return;
  }

  console.log(`Ghi vào cụm MongoDB: ${dbHost()}`);
  const now = new Date();
  const dir = new Directory();
  const users = await ensureUsers(dir, now);
  console.log(`Người dùng: tạo mới ${users.created}/36.`);

  const wsByKey = new Map<string, WorkspaceCtx>();
  const channelsByWs = new Map<string, SeededChannel[]>();
  const tasksByWs = new Map<string, SeededTask[]>();
  const expensesByWs = new Map<string, SeededExpense[]>();

  for (const spec of specs) {
    const ws = await ensureWorkspace(dir, spec, now);
    wsByKey.set(spec.key, ws);
    const channels = await ensureChannels(dir, ws, now);
    const seededChannels = await seedChannelMessages(dir, ws, channels, now);
    channelsByWs.set(spec.key, seededChannels);
    const tasks = await seedBoards(dir, ws, now);
    tasksByWs.set(spec.key, tasks);
    const study = await seedStudySets(dir, ws, now);
    const xpEvents = await seedXp(dir, ws, tasks, study.created);
    const expenses = await seedWallet(dir, ws, now);
    expensesByWs.set(spec.key, expenses);
    await refreshCounts(ws);
    const days = await seedWorkspaceStats(ws, now);
    const freshMsgs = seededChannels.reduce((n, c) => n + c.posted.filter((p) => p.fresh).length, 0);
    const members = await prisma.workspaceMembership.count({ where: { workspaceId: ws.id, status: "ACTIVE" } });
    console.log(
      `· ${spec.name} (${ws.isNew ? "mới" : "có sẵn"}): ${members} thành viên, ${channels.length} kênh, +${freshMsgs} tin, +${tasks.length} thẻ, +${study.sets} bộ học/${study.items} mục, +${xpEvents} sự kiện XP, +${expenses.length} khoản chi, +${days} ngày thống kê`
    );
  }

  let conversations: SeededConversation[] = [];
  if (!only || only.length === 0) {
    const dm = await seedDirectMessages(dir, dms, now);
    const groups = await seedGroupChats(dir, groupChats, wsByKey, now);
    conversations = [...dm, ...groups];
    const fresh = conversations.reduce((n, c) => n + c.posted.filter((p) => p.fresh).length, 0);
    console.log(`· Hội thoại: ${dm.length} DM + ${groups.length} nhóm chat, +${fresh} tin`);
  }

  const notifications = await seedThuNotifications({
    dir,
    now,
    workspaces: [...wsByKey.values()],
    channels: channelsByWs,
    tasks: tasksByWs,
    expenses: expensesByWs,
    conversations,
  });
  console.log(`· Thông báo mới cho thu601925@gmail.com: ${notifications}`);

  if (arg("skip-modules") === undefined) await runModuleSeeds({ dir, now, workspaces: wsByKey });
  console.log("Xong. Đăng nhập thu601925@gmail.com / 123456aA@ — hoặc bất kỳ <khoá>@seed.superapp.local với cùng mật khẩu.");
}

/**
 * Chạy mọi bộ seed phân hệ trong `seed-rich/lib/modules/*.ts` (mỗi file xuất các hàm `seedXxx: ModuleSeed`), theo thứ tự tên file.
 * Một phân hệ lỗi không chặn các phân hệ còn lại — lỗi được in ra và làm mã thoát khác 0; chạy lại là bù tiếp (idempotent).
 */
async function runModuleSeeds(ctx: ModuleCtx): Promise<void> {
  const modDir = path.join(__dirname, "seed-rich/lib/modules");
  if (!fs.existsSync(modDir)) return;
  const files = fs.readdirSync(modDir).filter((n) => n.endsWith(".ts") && !n.endsWith(".content.ts")).sort();
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(modDir, file)) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(mod)) {
      if (!name.startsWith("seed") || typeof fn !== "function") continue;
      try {
        console.log(`· ${await (fn as ModuleSeed)(ctx)}`);
      } catch (err) {
        console.error(`✗ ${file}/${name} thất bại:`, err instanceof Error ? err.message : err);
        process.exitCode = 1;
      }
    }
  }
}

main()
  .catch((err) => {
    console.error("Seed rich-demo thất bại:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
