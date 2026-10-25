#!/usr/bin/env ts-node
/**
 * ============================================================================
 * SEED ảnh & kho tài liệu — chạy SAU `db:seed:rich-demo`
 * ============================================================================
 *
 * Làm qua CHÍNH API của app (đăng nhập từng tài khoản mẫu bằng mật khẩu chung `123456aA@`), nên tệp đi vào đúng kho lưu trữ
 * (Cloudinary/S3) mà server đang dùng và qua đúng bước kiểm tra tệp của worker:
 *   · ảnh đại diện minh hoạ cho 36 người dùng mẫu (người đã có ảnh thì bỏ qua)
 *   · logo + ảnh bìa cho 8 nhóm (nhóm đã có ảnh thì bỏ qua)
 *   · kho tài liệu: thư mục + tệp (PDF slide, DOCX, XLSX, PNG poster, Markdown/CSV/JSON/mã nguồn) của 8 nhóm
 *   · ảnh đính kèm trong tin nhắn kênh (tin mới đăng sau các tin đã seed; ghi trực tiếp DB + AssetLink)
 * Idempotent: tên tệp/thư mục, ảnh nhóm/người dùng và tin ảnh đều nhận diện được nên chạy lại không tạo trùng.
 *
 * Cần: backend (API + worker) đang chạy ở địa chỉ `--api=` và DB_URL của `.env` trỏ cùng cụm MongoDB với API đó.
 *
 * Sử dụng:
 *   npm run db:seed:rich-media -- --api=https://api-production-9c319.up.railway.app/api/v1
 *   npm run db:seed:rich-media -- --api=http://localhost:3000/api/v1 --only=avatars,workspaces,files,chat
 *   npm run db:seed:rich-media -- --api=... --users=thanhtung,thuhien   (chỉ chạy cho một vài người — để thử trước)
 * ============================================================================
 */
import { normalizeSearch } from "../src/core/utils/normalize";
import { newObjectId } from "../src/core/utils/object-id";
import { extractLinks } from "../src/modules/messages/services/markdown-lite";
import { spec as appdev } from "./seed-rich/content/appdev";
import { spec as backend } from "./seed-rich/content/backend";
import { spec as capstone } from "./seed-rich/content/capstone";
import { CHAT_IMAGES } from "./seed-rich/content/chat-images";
import { spec as dsa } from "./seed-rich/content/dsa";
import { spec as frontend } from "./seed-rich/content/frontend";
import { spec as ielts } from "./seed-rich/content/ielts";
import { spec as math } from "./seed-rich/content/math";
import { RESOURCES } from "./seed-rich/content/resources";
import { spec as uiux } from "./seed-rich/content/uiux";
import { Directory, MIN_MS, prisma } from "./seed-rich/lib/core";
import { allocateSeqs } from "./seed-rich/lib/messages";
import { ApiError, AssetRejectedError, Session, uploadAsset } from "./seed-rich/media/api";
import { renderAvatar, renderDocx, renderPoster, renderSlidesPdf, renderWorkspaceAvatar, renderWorkspaceCover, renderXlsx } from "./seed-rich/media/render";
import type { ChatImageSpec, ResourceFileSpec } from "./seed-rich/media/types";
import { PEOPLE, SEED_PASSWORD, THU_EMAIL, THU_KEY, emailOf } from "./seed-rich/people";
import type { WorkspaceSpec } from "./seed-rich/types";

const ALL_SPECS: readonly WorkspaceSpec[] = [frontend, math, appdev, ielts, dsa, backend, capstone, uiux];
const TAGLINES: Record<string, string> = {
  frontend: "HTML · CSS · JavaScript · React",
  math: "Giải tích · Đại số tuyến tính · Xác suất",
  appdev: "Dự án app Tiêu Gọn — React Native + Node.js",
  ielts: "Listening · Reading · Writing · Speaking",
  dsa: "Cấu trúc dữ liệu & Giải thuật · LeetCode",
  backend: "Express · MongoDB · Prisma · Docker",
  capstone: "Đồ án tốt nghiệp — Quản lý thư viện",
  uiux: "Figma · Nguyên lý thiết kế · Nghiên cứu người dùng",
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

const MIME_BY_EXT: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
};

const extOf = (name: string): string => name.slice(name.lastIndexOf(".") + 1).toLowerCase();

async function fileBuffer(f: ResourceFileSpec): Promise<{ buffer: Buffer; mime: string; kind: "IMAGE" | "FILE" }> {
  switch (f.kind) {
    case "text":
      return { buffer: Buffer.from(f.body, "utf8"), mime: MIME_BY_EXT[extOf(f.name)] ?? "text/plain", kind: "FILE" };
    case "code":
      return { buffer: Buffer.from(f.body, "utf8"), mime: "text/plain", kind: "FILE" };
    case "slides":
      return { buffer: await renderSlidesPdf(f.theme, f.slides), mime: "application/pdf", kind: "FILE" };
    case "doc":
      return { buffer: await renderDocx(f.title, f.sections), mime: MIME_BY_EXT.docx, kind: "FILE" };
    case "sheet":
      return { buffer: await renderXlsx(f.sheetName, f.rows), mime: MIME_BY_EXT.xlsx, kind: "FILE" };
    case "poster":
      return { buffer: await renderPoster(f.poster), mime: "image/png", kind: "IMAGE" };
  }
}

interface FallbackFile {
  name: string;
  buffer: Buffer;
  mime: string;
}

/**
 * Máy chủ từ chối PDF/DOCX/XLSX (kiểm chữ ký không khớp) → lưu bản Markdown/CSV cùng nội dung để kho tài liệu vẫn đầy đủ.
 * Chạy lại script sau khi máy chủ nhận lại được các định dạng đó thì tệp gốc sẽ được thêm vào.
 */
function fallbackOf(f: ResourceFileSpec): FallbackFile | undefined {
  const base = f.name.slice(0, f.name.lastIndexOf("."));
  const md = (lines: string[]): FallbackFile => ({ name: `${base}.md`, buffer: Buffer.from(lines.join("\n") + "\n", "utf8"), mime: "text/markdown" });
  switch (f.kind) {
    case "slides":
      return md([`# ${base}`, ...f.slides.flatMap((s, i) => ["", `## Slide ${i + 1}: ${s.title}`, "", ...s.bullets.map((b) => `- ${b}`)])]);
    case "doc":
      return md([`# ${f.title}`, ...f.sections.flatMap((s) => ["", `## ${s.heading}`, "", ...(s.paragraphs ?? []).flatMap((p) => [p, ""]), ...(s.bullets ?? []).map((b) => `- ${b}`)])]);
    case "sheet": {
      const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      return { name: `${base}.csv`, buffer: Buffer.from(f.rows.map((r) => r.map(cell).join(",")).join("\n") + "\n", "utf8"), mime: "text/csv" };
    }
    default:
      return undefined;
  }
}

/** Loại tệp (slides/doc/sheet) mà máy chủ đã từ chối trong lần chạy này — các tệp sau cùng loại dùng bản thay thế ngay. */
const rejectedKinds = new Set<string>();

interface Counts {
  avatars: number;
  wsImages: number;
  folders: number;
  files: number;
  chatImages: number;
  failures: string[];
}

const itemsOf = (raw: unknown): Array<Record<string, unknown>> => {
  const data = (raw as { data?: unknown }).data;
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const inner = data as { items?: unknown; data?: unknown; folders?: unknown; children?: unknown } | undefined;
  for (const c of [inner?.items, inner?.data, inner?.folders, inner?.children]) if (Array.isArray(c)) return c as Array<Record<string, unknown>>;
  return [];
};

async function main(): Promise<void> {
  const api = arg("api") ?? process.env.SEED_API_URL;
  if (!api) {
    console.error("Thiếu địa chỉ API: --api=https://.../api/v1 (hoặc biến SEED_API_URL).");
    process.exitCode = 1;
    return;
  }
  const only = new Set((arg("only") ?? "avatars,workspaces,files,chat").split(",").map((s) => s.trim()));
  const onlyUsers = arg("users") ? new Set((arg("users") as string).split(",").map((x) => x.trim())) : undefined;
  console.log(`API: ${api}`);

  // Bảng khoá → id từ DB
  const dir = new Directory();
  const users = await prisma.user.findMany({ where: { email: { in: [THU_EMAIL, ...PEOPLE.map((p) => emailOf(p.key))] } }, select: { id: true, email: true, name: true } });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  for (const k of [THU_KEY, ...PEOPLE.map((p) => p.key)]) {
    const u = byEmail.get(k === THU_KEY ? THU_EMAIL : emailOf(k));
    if (!u) throw new Error(`Chưa có tài khoản "${k}" — chạy db:seed:rich-demo trước.`);
    dir.set(k, u.id, u.name);
  }

  // Nhóm làm việc → id
  const wsId = new Map<string, string>();
  for (const spec of ALL_SPECS) {
    const ws = await prisma.workspace.findFirst({ where: { ownerId: dir.id(spec.owner), normalizedName: normalizeSearch(spec.name) }, select: { id: true } });
    if (!ws) throw new Error(`Chưa có nhóm "${spec.name}" — chạy db:seed:rich-demo trước.`);
    wsId.set(spec.key, ws.id);
  }

  // Kế hoạch theo người: chủ nhóm đi trước (để tạo thư mục/ảnh nhóm trước khi người khác tải tệp vào).
  const owners = [...new Set(ALL_SPECS.map((s) => s.owner))];
  const everyone = [THU_KEY, ...PEOPLE.map((p) => p.key)];
  const order = [...owners, ...everyone.filter((k) => !owners.includes(k))];

  const counts: Counts = { avatars: 0, wsImages: 0, folders: 0, files: 0, chatImages: 0, failures: [] };
  const folderIds = new Map<string, string>(); // `${wsKey}/${folderName}` → id
  const now = new Date();

  for (const key of order) {
    if (onlyUsers && !onlyUsers.has(key)) continue;
    const files = ALL_SPECS.flatMap((spec) => (RESOURCES[spec.key]?.files ?? []).filter((f) => f.by === key).map((file) => ({ spec, file })));
    const chat = CHAT_IMAGES.filter((c) => c.by === key);
    const ownedSpecs = ALL_SPECS.filter((s) => s.owner === key);
    const needsAvatar = only.has("avatars") && key !== THU_KEY;
    if (!needsAvatar && !(only.has("workspaces") && ownedSpecs.length) && !(only.has("files") && (files.length || ownedSpecs.length)) && !(only.has("chat") && chat.length)) continue;

    console.log(`\n▶ ${dir.name(key)} (${key})`);
    const s = new Session(api, key === THU_KEY ? THU_EMAIL : emailOf(key), SEED_PASSWORD);
    await s.login();
    const attempt = async (label: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn();
      } catch (err) {
        const msg = `${key}: ${label} — ${err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)}`;
        counts.failures.push(msg);
        console.log(`  ✗ ${label}: ${msg.slice(0, 220)}`);
      }
    };

    if (needsAvatar) {
      await attempt("ảnh đại diện", async () => {
        const me = (await s.get<{ avatar: string | null }>("/auth/me")).data;
        if (me.avatar) return;
        const up = await uploadAsset(s, { scope: "AVATAR", kind: "IMAGE", fileName: `${key}.png`, mime: "image/png", buffer: await renderAvatar(key) });
        await s.request("PATCH", `/users/${s.userId}`, { avatarAssetId: up.id });
        counts.avatars += 1;
        console.log("  ✓ ảnh đại diện");
      });
    }

    for (const spec of ownedSpecs) {
      const id = wsId.get(spec.key) as string;
      if (only.has("workspaces")) {
        await attempt(`ảnh nhóm ${spec.key}`, async () => {
          const detail = (await s.get<{ version: number; avatarUrl?: string | null; coverUrl?: string | null }>(`/workspaces/${id}`)).data;
          let version = detail.version;
          if (!detail.avatarUrl) {
            const up = await uploadAsset(s, { scope: "AVATAR", kind: "IMAGE", fileName: `${spec.key}-logo.png`, mime: "image/png", buffer: await renderWorkspaceAvatar(spec.key, spec.name, spec.cover) });
            const r = await s.request<{ version: number }>("PATCH", `/workspaces/${id}`, { avatarAssetId: up.id, expectedVersion: version });
            version = r.data?.version ?? version + 1;
            counts.wsImages += 1;
          }
          if (!detail.coverUrl) {
            const up = await uploadAsset(s, { scope: "AVATAR", kind: "IMAGE", fileName: `${spec.key}-cover.jpg`, mime: "image/jpeg", buffer: await renderWorkspaceCover(spec.key, spec.name, TAGLINES[spec.key] ?? "", spec.cover) });
            await s.request("PATCH", `/workspaces/${id}`, { coverAssetId: up.id, expectedVersion: version });
            counts.wsImages += 1;
          }
          console.log(`  ✓ ảnh nhóm "${spec.name}"`);
        });
      }
      if (only.has("files")) {
        await attempt(`thư mục ${spec.key}`, async () => {
          for (const folder of RESOURCES[spec.key]?.folders ?? []) await ensureFolder(s, counts, folderIds, spec.key, id, folder.name, folder.parent);
        });
      }
    }

    if (only.has("files")) {
      for (const { spec, file } of files) {
        const id = wsId.get(spec.key) as string;
        await attempt(`tệp ${file.name}`, async () => {
          const folderId = file.folder ? await ensureFolder(s, counts, folderIds, spec.key, id, file.folder, RESOURCES[spec.key]?.folders.find((f) => f.name === file.folder)?.parent) : undefined;
          const existing = await listResourceNames(s, id, folderId);
          const fb = fallbackOf(file);
          if (existing.has(file.name) || (fb && existing.has(fb.name))) return;
          let name = file.name;
          let upId: string | undefined;
          if (!(fb && rejectedKinds.has(file.kind))) {
            try {
              const { buffer, mime, kind } = await fileBuffer(file);
              upId = (await uploadAsset(s, { scope: "RESOURCE", kind, fileName: file.name, mime, buffer, workspaceId: id })).id;
            } catch (err) {
              if (!(err instanceof AssetRejectedError) || !fb) throw err;
              rejectedKinds.add(file.kind);
              console.log(`  … máy chủ từ chối định dạng "${file.kind}" → dùng bản ${fb.name.slice(fb.name.lastIndexOf("."))} cùng nội dung`);
            }
          }
          if (!upId && fb) {
            name = fb.name;
            upId = (await uploadAsset(s, { scope: "RESOURCE", kind: "FILE", fileName: fb.name, mime: fb.mime, buffer: fb.buffer, workspaceId: id })).id;
          }
          await s.request("POST", `/workspaces/${id}/resources`, { assetId: upId, ...(folderId ? { folderId } : {}), name, description: file.description, tags: file.tags });
          counts.files += 1;
          console.log(`  ✓ ${spec.key}/${file.folder ?? ""}/${name}`);
        });
      }
    }

    if (only.has("chat")) {
      for (const [i, img] of chat.entries()) {
        await attempt(`ảnh chat ${img.ws}/${img.channel}`, async () => {
          if (await postChatImage(s, dir, wsId, img, i, now)) {
            counts.chatImages += 1;
            console.log(`  ✓ ảnh chat ${img.ws}/${img.channel}`);
          }
        });
      }
    }
    await s.logout();
  }

  console.log(`\nXong: ${counts.avatars} ảnh đại diện, ${counts.wsImages} ảnh nhóm, ${counts.folders} thư mục, ${counts.files} tệp, ${counts.chatImages} tin ảnh. Lỗi: ${counts.failures.length}`);
  for (const f of counts.failures) console.log(" -", f.slice(0, 260));
  if (counts.failures.length > 0) process.exitCode = 2;
}

async function ensureFolder(s: Session, counts: Counts, cache: Map<string, string>, wsKey: string, wsId: string, name: string, parent?: string): Promise<string> {
  const ck = `${wsKey}/${parent ? parent + "/" : ""}${name}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const parentId = parent ? await ensureFolder(s, counts, cache, wsKey, wsId, parent) : undefined;
  const list = itemsOf((await s.get(`/workspaces/${wsId}/folders${parentId ? `?parentId=${parentId}` : ""}`)).raw);
  const found = list.find((f) => normalizeSearch(String(f.name)) === normalizeSearch(name));
  let id = found?.id as string | undefined;
  if (!id) {
    id = ((await s.request<{ id: string }>("POST", `/workspaces/${wsId}/folders`, { name, ...(parentId ? { parentId } : {}) })).data as { id: string }).id;
    counts.folders += 1;
  }
  cache.set(ck, id);
  return id;
}

async function listResourceNames(s: Session, wsId: string, folderId?: string): Promise<Set<string>> {
  const names = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = `folderId=${folderId ?? "root"}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await s.get(`/workspaces/${wsId}/resources?${q}`);
    for (const r of itemsOf(res.raw)) names.add(String(r.name));
    const next = (res.raw as { nextCursor?: string | null; meta?: { nextCursor?: string | null } }).nextCursor ?? (res.raw as { meta?: { nextCursor?: string | null } }).meta?.nextCursor;
    if (!next) break;
    cursor = next;
  }
  return names;
}

/** Đăng một tin ảnh vào kênh: tải ảnh (scope MESSAGE) qua API rồi ghi Message + AssetLink trực tiếp vào DB. Trả `false` nếu đã có. */
async function postChatImage(s: Session, dir: Directory, wsId: Map<string, string>, img: ChatImageSpec, index: number, now: Date): Promise<boolean> {
  const workspaceId = wsId.get(img.ws);
  if (!workspaceId) throw new Error(`Không có nhóm ${img.ws}`);
  const channel = await prisma.channel.findUnique({ where: { workspaceId_normalizedName: { workspaceId, normalizedName: normalizeSearch(img.channel) } } });
  if (!channel) throw new Error(`Không có kênh "${img.channel}" trong ${img.ws}`);
  const authorId = dir.id(img.by);
  const clientMessageId = `seed-rich:img:${img.ws}:${normalizeSearch(img.channel)}:${index}:${normalizeSearch(img.poster.title).slice(0, 24)}`;
  const dedupeKey = `u:${authorId}:${clientMessageId}`;
  if (await prisma.message.findUnique({ where: { dedupeKey }, select: { id: true } })) return false;

  const buffer = await renderPoster(img.poster);
  const up = await uploadAsset(s, { scope: "MESSAGE", kind: "IMAGE", fileName: `${normalizeSearch(img.poster.title).replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`, mime: "image/png", buffer, workspaceId });
  const last = await prisma.message.findFirst({ where: { scopeType: "CHANNEL", scopeId: channel.id, threadKey: "root" }, orderBy: { seq: "desc" }, select: { createdAt: true } });
  const createdAt = new Date(Math.min(now.getTime() - 3 * MIN_MS, Math.max((last?.createdAt.getTime() ?? 0) + 2 * MIN_MS, now.getTime() - 90 * MIN_MS)));
  const seq = await allocateSeqs({ type: "CHANNEL", id: channel.id, workspaceId }, "root", 1);
  const id = newObjectId();
  const content = img.text;
  await prisma.message.create({
    data: {
      id,
      scopeType: "CHANNEL",
      scopeId: channel.id,
      workspaceId,
      threadId: null,
      threadKey: "root",
      seq,
      authorId,
      kind: "USER",
      clientMessageId,
      dedupeKey,
      content,
      normalizedContent: normalizeSearch(content),
      mentions: [],
      attachments: [{ assetId: up.id, kind: "IMAGE", name: "hinh-anh.png", mime: "image/png", size: buffer.length, width: 1600, height: 900, waveform: [] }],
      links: extractLinks(content),
      reactionsSummary: [],
      pinnedAt: null,
      pinnedBy: null,
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt,
      updatedAt: createdAt,
    },
  });
  await prisma.assetLink.create({ data: { assetId: up.id, targetType: "MESSAGE", targetId: id, scopeType: "CHANNEL", scopeId: channel.id, createdBy: authorId } });
  await prisma.channel.updateMany({ where: { id: channel.id, lastSeq: { lt: seq } }, data: { lastSeq: seq, lastMessageAt: createdAt, lastMessageId: id } });
  return true;
}

main()
  .catch((err) => {
    console.error("Seed media thất bại:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
