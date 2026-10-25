/**
 * Bộ seed TÀI LIỆU CỘNG TÁC và BẢNG TRẮNG (module `documents` / `whiteboards`).
 *
 * Nội dung thật của cả hai nằm ở MongoDB: `Document.yjsState` / `Whiteboard.yjsState` (BE là nguồn duy nhất; service `collab/` chỉ tải/lưu qua
 * `/api/internal/*`, không có kết nối Mongo riêng). Vì vậy script dựng trạng thái Yjs đúng định dạng rồi ghi thẳng — mở tài liệu, app/collab
 * đọc lại được (đã đối chiếu với y-tiptap thật và `isValidElement` của BE). Cộng tác viên chỉ dành cho tài liệu/bảng PRIVATE (người tạo không có dòng).
 * Không ghi outbox, không gọi collab, không tạo ảnh thu nhỏ (`thumbnailAssetId: null`).
 */
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { DAY_MS, prisma, rngFrom } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import type { WorkspaceCtx } from "../workspace";
import { BoardBuilder, encodeBoard } from "./collab-board-dsl";
import { capstoneBoards, backendBoards, uiuxBoards } from "./collab-boards-b.content";
import { appdevBoards, dsaBoards, frontendBoards, ieltsBoards, mathBoards } from "./collab-boards-a.content";
import { backendDocs, dsaDocs, ieltsDocs } from "./collab-docs-b.content";
import { appdevDocs, frontendDocs, mathDocs } from "./collab-docs-a.content";
import { capstoneDocs, uiuxDocs } from "./collab-docs-c.content";
import { buildDocument, clientIdFor, extractText } from "./collab-yjs";
import type { BoardSpec, CollabRole, DocSpec } from "./collab.types";
import { insertNotification } from "./notify-util";

const DOCS: Record<string, readonly DocSpec[]> = {
  frontend: frontendDocs,
  math: mathDocs,
  appdev: appdevDocs,
  ielts: ieltsDocs,
  dsa: dsaDocs,
  backend: backendDocs,
  capstone: capstoneDocs,
  uiux: uiuxDocs,
};
const BOARDS: Record<string, readonly BoardSpec[]> = {
  frontend: frontendBoards,
  math: mathBoards,
  appdev: appdevBoards,
  ielts: ieltsBoards,
  dsa: dsaBoards,
  backend: backendBoards,
  capstone: capstoneBoards,
  uiux: uiuxBoards,
};

interface Tally {
  docs: number;
  docSnaps: number;
  boards: number;
  boardSnaps: number;
  collabs: number;
  notifications: number;
}

/**
 * Thời điểm cách `now` đúng `daysAgo` ngày (cộng độ lệch giờ tất định) trong [min, max]. Nếu mốc đó trước `min` (nhóm/người dùng trẻ hơn dự kiến)
 * thì rải vào 60% đầu của cửa sổ thay vì dồn hết vào `min`; nếu sau `max` thì lấy `max`.
 */
function pickTime(now: Date, daysAgo: number, rng: () => number, min: Date, max: Date): Date {
  const t = now.getTime() - daysAgo * DAY_MS - Math.floor(rng() * 9 * 3_600_000);
  const spread = rng();
  if (t < min.getTime()) return new Date(min.getTime() + Math.floor(spread * 0.6 * (max.getTime() - min.getTime())));
  return new Date(Math.min(t, max.getTime()));
}

/** Mốc sớm nhất người này có thể tạo gì đó trong nhóm: chủ nhóm = lúc lập nhóm; người khác = lúc vào nhóm (nếu muộn hơn lúc lập nhóm). */
async function memberSince(ws: WorkspaceCtx, key: string, userId: string): Promise<Date> {
  if (ws.roles.get(key) === "OWNER") return ws.createdAt;
  const m = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId } }, select: { joinedAt: true } });
  return m && m.joinedAt > ws.createdAt ? m.joinedAt : ws.createdAt;
}

/** Cửa sổ [min, max] hợp lệ: nếu bị ép chật (người mới vào nhóm) thì max = min; không bao giờ vượt `now`. */
function timeWindow(now: Date, min: Date, preferredMax: Date): [Date, Date] {
  const lo = new Date(Math.min(min.getTime(), now.getTime() - 60_000));
  return [lo, new Date(Math.max(Math.min(preferredMax.getTime(), now.getTime() - 60_000), lo.getTime()))];
}

function assertMember(ws: WorkspaceCtx, key: string, what: string): void {
  if (!ws.roles.has(key)) throw new Error(`[${ws.spec.key}] ${what}: "${key}" không phải thành viên nhóm`);
}

/** Vai cộng tác → khoá người; kiểm thành viên nhóm và không trùng người tạo. */
function checkCollab(ws: WorkspaceCtx, what: string, by: string, collab: ReadonlyArray<readonly [string, CollabRole]>, visibility: string | undefined): void {
  if (visibility === "PRIVATE" && collab.length === 0) throw new Error(`[${ws.spec.key}] ${what}: riêng tư phải có người cộng tác`);
  const seen = new Set<string>();
  for (const [key] of collab) {
    assertMember(ws, key, what);
    if (key === by || seen.has(key)) throw new Error(`[${ws.spec.key}] ${what}: cộng tác viên "${key}" trùng/là người tạo`);
    seen.add(key);
  }
}

/** Thông báo "được mời cùng soạn" của TÀI LIỆU (như `PrismaDocumentNotifier`; bảng trắng không gửi thông báo khi mời nên không có). Chưa đọc nếu mới trong 3 ngày. */
async function notifyInvited(c: ModuleCtx, ws: WorkspaceCtx, id: string, by: string, collab: ReadonlyArray<readonly [string, CollabRole]>, at: Date): Promise<boolean> {
  if (collab.length === 0) return false;
  const fresh = c.now.getTime() - at.getTime() < 3 * DAY_MS;
  const res = await insertNotification({
    type: "document.collaborator-added",
    scopeType: "WORKSPACE",
    scopeId: ws.id,
    workspaceId: ws.id,
    actorId: c.dir.id(by),
    sourceType: "document",
    sourceId: id,
    refs: { workspaceId: ws.id, documentId: id, role: collab[0][1] },
    dedupeKey: `seed-rich:document-collab:${id}`,
    createdAt: new Date(at.getTime() + 60_000),
    recipients: collab.map(([key]) => ({ userId: c.dir.id(key), readAt: fresh && key === "thu" ? null : new Date(at.getTime() + 3_600_000) })),
  });
  return res.created;
}

async function seedDocument(c: ModuleCtx, ws: WorkspaceCtx, spec: DocSpec, t: Tally): Promise<void> {
  const { dir, now } = c;
  assertMember(ws, spec.by, `tài liệu "${spec.title}"`);
  assertMember(ws, spec.lastBy ?? spec.by, `tài liệu "${spec.title}"`);
  const collab = spec.collab ?? [];
  checkCollab(ws, `tài liệu "${spec.title}"`, spec.by, collab, spec.visibility);
  if (spec.editedDaysAgo > spec.daysAgo) throw new Error(`tài liệu "${spec.title}": editedDaysAgo > daysAgo`);

  const normalizedTitle = normalizeSearch(spec.title);
  const createdBy = dir.id(spec.by);
  if (await prisma.document.findFirst({ where: { workspaceId: ws.id, normalizedTitle, createdBy }, select: { id: true } })) return;

  const rng = rngFrom(`doc:${ws.spec.key}:${normalizedTitle}`);
  const [cMin, cMax] = timeWindow(now, new Date((await memberSince(ws, spec.by, createdBy)).getTime() + 2 * 3_600_000), new Date(now.getTime() - 4 * 3_600_000));
  const createdAt = pickTime(now, spec.daysAgo, rng, cMin, cMax);
  const [eMin, eMax] = timeWindow(now, new Date(createdAt.getTime() + 3_600_000), new Date(now.getTime() - 3_600_000));
  const editedAt = pickTime(now, spec.editedDaysAgo, rng, eMin, eMax);

  const history = spec.history ?? [];
  history.forEach((h, i) => {
    if (h.at < 1 || h.at > spec.blocks.length || (i > 0 && h.at <= history[i - 1].at)) throw new Error(`tài liệu "${spec.title}": mốc lịch sử #${i} không hợp lệ`);
    if (h.by) assertMember(ws, h.by, `tài liệu "${spec.title}"`);
  });
  const built = buildDocument(spec.blocks, clientIdFor(`${ws.spec.key}:${normalizedTitle}`), history.map((h) => h.at));
  const text = extractText(built.state);
  const finalVersion = 2 + history.length * 3 + 2;
  const archived = spec.archived === true;
  const docId = await prisma.$transaction(
    async (tx) => {
      const doc = await tx.document.create({
        data: {
          workspaceId: ws.id,
          title: spec.title,
          normalizedTitle,
          visibility: spec.visibility ?? "WORKSPACE",
          status: archived ? "ARCHIVED" : "ACTIVE",
          yjsState: Buffer.from(built.state),
          yjsVersion: finalVersion,
          stateBytes: built.state.byteLength,
          plainText: text.plainText,
          normalizedText: text.normalizedText,
          wordCount: text.wordCount,
          lastEditedBy: dir.id(spec.lastBy ?? spec.by),
          lastEditedAt: editedAt,
          createdBy,
          version: archived ? 2 : 1,
          // Quy ước Mongo null-vs-absent: danh sách lọc `status`, nhưng `archivedAt` vẫn ghi null tường minh khi chưa lưu trữ.
          archivedAt: archived ? new Date(Math.min(editedAt.getTime() + 3_600_000, now.getTime())) : null,
          createdAt,
          updatedAt: archived ? new Date(Math.min(editedAt.getTime() + 3_600_000, now.getTime())) : editedAt,
        },
      });
      for (const [key, role] of collab) {
        await tx.documentCollaborator.create({
          data: { documentId: doc.id, userId: dir.id(key), role, addedBy: createdBy, createdAt: new Date(createdAt.getTime() + 20 * 60_000) },
        });
      }
      for (let i = 0; i < history.length; i++) {
        const h = history[i];
        const at = pickTime(now, h.daysAgo, rng, new Date(createdAt.getTime() + 600_000), new Date(editedAt.getTime() - 600_000));
        await tx.documentSnapshot.create({
          data: {
            documentId: doc.id,
            kind: h.kind,
            label: h.label ?? null,
            yjsState: Buffer.from(built.checkpoints[i]),
            yjsVersion: 2 + i * 3,
            sizeBytes: built.checkpoints[i].byteLength,
            createdBy: h.kind === "MANUAL" ? dir.id(h.by ?? spec.by) : null,
            at,
          },
        });
      }
      return doc.id;
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  t.docs += 1;
  t.docSnaps += history.length;
  t.collabs += collab.length;
  if (await notifyInvited(c, ws, docId, spec.by, collab, createdAt)) t.notifications += 1;
}

async function seedWhiteboard(c: ModuleCtx, ws: WorkspaceCtx, spec: BoardSpec, t: Tally): Promise<void> {
  const { dir, now } = c;
  const what = `bảng trắng "${spec.name}"`;
  const drawers = spec.drawers ?? [spec.by];
  assertMember(ws, spec.by, what);
  drawers.forEach((k) => assertMember(ws, k, what));
  const collab = spec.collab ?? [];
  checkCollab(ws, what, spec.by, collab, spec.visibility);
  if (spec.visibility === "PRIVATE") {
    const editors = new Set([spec.by, ...collab.filter(([, r]) => r === "EDITOR").map(([k]) => k)]);
    for (const k of drawers) if (!editors.has(k)) throw new Error(`[${ws.spec.key}] ${what}: "${k}" vẽ được nhưng không có quyền sửa bảng riêng tư`);
  }

  const normalizedName = normalizeSearch(spec.name);
  const createdBy = dir.id(spec.by);
  if (await prisma.whiteboard.findFirst({ where: { workspaceId: ws.id, normalizedName, createdBy }, select: { id: true } })) return;

  const rng = rngFrom(`wb:${ws.spec.key}:${normalizedName}`);
  const [cMin, cMax] = timeWindow(now, new Date((await memberSince(ws, spec.by, createdBy)).getTime() + 2 * 3_600_000), new Date(now.getTime() - 4 * 3_600_000));
  const createdAt = pickTime(now, spec.daysAgo, rng, cMin, cMax);
  const [eMin, eMax] = timeWindow(now, new Date(createdAt.getTime() + 3_600_000), new Date(now.getTime() - 3_600_000));
  const editedAt = pickTime(now, spec.editedDaysAgo, rng, eMin, eMax);

  const board = new BoardBuilder(drawers.map((k) => dir.id(k)), createdAt.getTime(), editedAt.getTime());
  spec.draw(board);
  const clientId = clientIdFor(`${ws.spec.key}:${normalizedName}`);
  const state = encodeBoard(board.elements, spec.background, clientId);
  const history = spec.history ?? [];
  const lastBy = spec.lastBy ?? drawers[drawers.length - 1];
  const finalVersion = 2 + history.length * 3 + 2;

  await prisma.$transaction(
    async (tx) => {
      const wb = await tx.whiteboard.create({
        data: {
          workspaceId: ws.id,
          name: spec.name,
          normalizedName,
          visibility: spec.visibility ?? "WORKSPACE",
          status: "ACTIVE",
          yjsState: Buffer.from(state),
          yjsVersion: finalVersion,
          elementCount: board.elements.length,
          thumbnailAssetId: null,
          lastEditedBy: dir.id(lastBy),
          lastEditedAt: editedAt,
          createdBy,
          version: 1,
          archivedAt: null,
          createdAt,
          updatedAt: editedAt,
        },
      });
      for (const [key, role] of collab) {
        await tx.whiteboardCollaborator.create({
          data: { whiteboardId: wb.id, userId: dir.id(key), role, addedBy: createdBy, createdAt: new Date(createdAt.getTime() + 20 * 60_000) },
        });
      }
      for (const h of history) {
        const take = Math.max(1, Math.round(board.elements.length * h.ratio));
        const at = pickTime(now, h.daysAgo, rng, new Date(createdAt.getTime() + 600_000), new Date(editedAt.getTime() - 600_000));
        await tx.whiteboardSnapshot.create({
          data: {
            whiteboardId: wb.id,
            kind: h.kind,
            label: h.label ?? null,
            yjsState: Buffer.from(encodeBoard(board.elements, spec.background, clientId, take)),
            elementCount: take,
            createdBy: h.kind === "MANUAL" ? dir.id(h.by ?? spec.by) : null,
            at,
          },
        });
      }
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
  t.boards += 1;
  t.boardSnaps += history.length;
  t.collabs += collab.length;
}

export const seedCollab: ModuleSeed = async (c) => {
  const t: Tally = { docs: 0, docSnaps: 0, boards: 0, boardSnaps: 0, collabs: 0, notifications: 0 };
  for (const [key, ws] of c.workspaces) {
    for (const spec of DOCS[key] ?? []) await seedDocument(c, ws, spec, t);
    for (const spec of BOARDS[key] ?? []) await seedWhiteboard(c, ws, spec, t);
  }
  return `Cộng tác: +${t.docs} tài liệu (+${t.docSnaps} bản lưu), +${t.boards} bảng trắng (+${t.boardSnaps} bản lưu), +${t.collabs} cộng tác viên, +${t.notifications} thông báo mời`;
};

