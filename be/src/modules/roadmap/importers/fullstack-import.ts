import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { normalizeSearch } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import { BLOCKS_FORMAT_VERSION } from "../entities/block.interface";
import { buildLessonContent, type MediaRef } from "../services/content/build-lesson-content";
import { sanitizeSvg } from "../services/content/svg-sanitize";

const SUBJECT_SLUG = "fullstack";
const CONTENT_OWNER_EMAIL = "content-seed@superapp.local";
const CONTENT_OWNER_NAME = "Nội dung mẫu";
const LESSONS_PER_MONTH = 8;
const OPTIONAL_NUMBERS = new Set([35, 36, 38, 52, 53, 54]);

interface PhaseTheme {
  index: number;
  title: string;
  stageLabel: string;
  summary: string;
  capstone: string;
  color: string;
}

/** Chủ đề 7 tháng (T1–T7) — theo khảo sát `CLAUDE.md`/README của giáo trình (be.md §9.1); T8 DevOps để P1. */
const PHASES: readonly PhaseTheme[] = [
  { index: 1, title: "Tháng 1 — Frontend UI", stageLabel: "Giai đoạn 1 — Nền móng giao diện", summary: "HTML5 semantic/HTTP, CSS box model, Flexbox, Grid/responsive, animation, clone site, Tailwind.", capstone: "Project 1: Landing page", color: "blue" },
  { index: 2, title: "Tháng 2 — JavaScript Core", stageLabel: "Giai đoạn 1 — Nền móng giao diện", summary: "Kiểu dữ liệu/scope, closure/this, map/filter/reduce, DOM/event, ES6 module, storage/date, event loop/async.", capstone: "Project 2: Vanilla JS shop", color: "amber" },
  { index: 3, title: "Tháng 3 — TypeScript + React nền tảng", stageLabel: "Giai đoạn 1 — Nền móng giao diện", summary: "TS types/generics, Vite+JSX, useState/props, useEffect, useRef/custom hook, Router v6, Context/useReducer.", capstone: "Project 3: React app nền tảng", color: "cyan" },
  { index: 4, title: "Tháng 4 — React Enterprise", stageLabel: "Giai đoạn 2 — React chuyên sâu & Dữ liệu", summary: "TanStack Query, RTK, React Hook Form + Yup/Zod, Redux Saga, memo/useMemo, code splitting/Framer Motion, Vitest/Storybook.", capstone: "Project 4: React app doanh nghiệp", color: "violet" },
  { index: 5, title: "Tháng 5 — Database", stageLabel: "Giai đoạn 2 — React chuyên sâu & Dữ liệu", summary: "ERD, JOIN/subquery, index/EXPLAIN, transaction/ACID, MongoDB schema, aggregation, Prisma + PostgreSQL, Redis cơ bản.", capstone: "Thiết kế CSDL cho dự án cuối khoá", color: "emerald" },
  { index: 6, title: "Tháng 6 — Node/Express Core", stageLabel: "Giai đoạn 3 — Backend & tính năng thực tế", summary: "Event loop, layered architecture, middleware/error, Zod/Joi, bcrypt + JWT, RBAC, CORS/Helmet/rate limit, Multer/S3.", capstone: "Project 5: REST API nền tảng", color: "red" },
  { index: 7, title: "Tháng 7 — Backend nâng cao", stageLabel: "Giai đoạn 3 — Backend & tính năng thực tế", summary: "Socket.io, thông báo realtime, email SES, RabbitMQ/BullMQ, microservices, HLS, VNPay/ZaloPay, Swagger.", capstone: "Project 6: Backend đầy đủ tính năng", color: "orange" },
];

export interface ImportOptions {
  dir: string;
  dryRun: boolean;
  overwrite: boolean;
}

export interface ImportLessonReport {
  number: number;
  slug: string;
  title: string;
  status: "created" | "updated" | "skipped-edited" | "unchanged" | "missing-file";
  mediaCount: number;
  resourceCount: number;
  warnings: string[];
}

export interface ImportReport {
  phases: number;
  lessons: ImportLessonReport[];
}

function findLessonFile(dir: string, month: number, number: number): string | null {
  const lessonDir = join(dir, `t${month}`, `b${number}`);
  const direct = join(lessonDir, `b${number}.md`);
  if (existsSync(direct)) return direct;

  const isMainFile = (name: string) => /^buoi-\d+-/i.test(name) && name.endsWith(".md") && !/(cheatsheet|slides|addendum)/i.test(name);
  if (existsSync(lessonDir)) {
    const hit = readdirSync(lessonDir).find(isMainFile);
    if (hit) return join(lessonDir, hit);
  }
  const monthDir = join(dir, `t${month}`);
  if (existsSync(monthDir)) {
    const hit = readdirSync(monthDir).find((f) => isMainFile(f) && new RegExp(`^buoi-0*${number}-`, "i").test(f));
    if (hit) return join(monthDir, hit);
  }
  return null;
}

function findMediaFiles(dir: string, month: number, number: number): { group: string; path: string }[] {
  const lessonDir = join(dir, `t${month}`, `b${number}`);
  const out: { group: string; path: string }[] = [];
  for (const [sub, group] of [["code", "Tại lớp"], ["homework", "Bài về nhà"]] as const) {
    const p = join(lessonDir, sub);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p)) if (f.toLowerCase().endsWith(".svg")) out.push({ group, path: join(p, f) });
  }
  return out;
}

async function ensureContentOwner(client: PrismaClient): Promise<string> {
  const owner = await client.user.upsert({
    where: { email: CONTENT_OWNER_EMAIL },
    update: {},
    create: { email: CONTENT_OWNER_EMAIL, name: CONTENT_OWNER_NAME, normalizedName: normalizeSearch(CONTENT_OWNER_NAME), role: "user", status: "ACTIVE", emailVerified: true, emailVerifiedAt: new Date() },
  });
  return owner.id;
}

async function ensureSubject(client: PrismaClient, ownerId: string): Promise<{ id: string; version: number }> {
  const existing = await client.roadmapSubject.findUnique({ where: { slug: SUBJECT_SLUG } });
  if (existing) return existing;
  const title = "Lập trình Fullstack";
  const created = await client.roadmapSubject.create({
    data: {
      slug: SUBJECT_SLUG,
      title,
      normalizedTitle: normalizeSearch(title),
      description: "Lộ trình tự học lập trình Fullstack từ HTML/CSS/JS cơ bản tới React, TypeScript, Node/Express và cơ sở dữ liệu — 7 tháng, 56 buổi.",
      category: "programming",
      color: "blue",
      icon: "code",
      lessonLabel: "Buổi",
      defaultStudyDays: [2, 5],
      unlockMode: "FREE",
      status: "DRAFT",
      order: 1024,
      phaseCount: 0,
      lessonCount: 0,
      requiredLessonCount: 0,
      sourceRef: "import:fullstack",
      version: 1,
      createdBy: ownerId,
      updatedBy: null,
      publishedAt: null,
      archivedAt: null,
      deletedAt: null,
    },
  });
  return created;
}

async function ensurePhase(client: PrismaClient, subjectId: string, theme: PhaseTheme): Promise<string> {
  const existing = await client.roadmapPhase.findFirst({ where: { subjectId, index: theme.index } });
  if (existing) return existing.id;
  const created = await client.roadmapPhase.create({
    data: { subjectId, index: theme.index, title: theme.title, summary: theme.summary, stageLabel: theme.stageLabel, color: theme.color, capstone: theme.capstone, order: theme.index * 1024, lessonCount: 0, version: 1, deletedAt: null },
  });
  return created.id;
}

/** Nhập/đồng bộ giáo trình Fullstack (7 tháng T1–T7, 56 buổi) — idempotent theo slug `fullstack-b<N>` (be.md §9.1). */
export async function importFullstackRoadmap(client: PrismaClient, opts: ImportOptions): Promise<ImportReport> {
  const ownerId = opts.dryRun ? "" : await ensureContentOwner(client);
  const subject = opts.dryRun ? null : await ensureSubject(client, ownerId);
  const lessons: ImportLessonReport[] = [];

  for (const theme of PHASES) {
    const phaseId = opts.dryRun || !subject ? "" : await ensurePhase(client, subject.id, theme);
    for (let i = 1; i <= LESSONS_PER_MONTH; i++) {
      const number = (theme.index - 1) * LESSONS_PER_MONTH + i;
      const slug = `${SUBJECT_SLUG}-b${number}`;
      const filePath = findLessonFile(opts.dir, theme.index, number);
      if (!filePath) {
        lessons.push({ number, slug, title: "", status: "missing-file", mediaCount: 0, resourceCount: 0, warnings: [`Không tìm thấy file cho buổi ${number} (tháng ${theme.index})`] });
        continue;
      }
      const rawMd = readFileSync(filePath, "utf8");
      const mediaFiles = findMediaFiles(opts.dir, theme.index, number);

      if (opts.dryRun) {
        const built = buildLessonContent(rawMd, mediaFiles.map((m, idx) => ({ id: `dry-${idx}`, sourcePath: m.path })));
        lessons.push({ number, slug, title: built.title ?? "(không có H1)", status: "unchanged", mediaCount: mediaFiles.length, resourceCount: built.resources.length, warnings: built.warnings });
        continue;
      }

      const existing = await client.roadmapLesson.findUnique({ where: { slug } });
      if (existing && existing.updatedBy && !opts.overwrite) {
        lessons.push({ number, slug, title: existing.title, status: "skipped-edited", mediaCount: existing.mediaCount, resourceCount: existing.resources.length, warnings: [] });
        continue;
      }

      const lessonId = existing?.id ?? newObjectId();
      if (!existing || opts.overwrite) {
        await client.roadmapMedia.deleteMany({ where: { lessonId } });
        for (const [idx, m] of mediaFiles.entries()) {
          const sanitized = sanitizeSvg(readFileSync(m.path, "utf8"));
          if (!sanitized.svg) continue;
          await client.roadmapMedia.create({
            data: { lessonId, subjectId: subject!.id, kind: "SVG", group: m.group, caption: null, svg: sanitized.svg, assetId: null, width: sanitized.width, height: sanitized.height, sourcePath: m.path, order: (idx + 1) * 1024, deletedAt: null },
          });
        }
      }
      const currentMedia = await client.roadmapMedia.findMany({ where: { lessonId }, select: { id: true, sourcePath: true } });
      const mediaRefs: MediaRef[] = currentMedia.filter((m): m is { id: string; sourcePath: string } => m.sourcePath !== null).map((m) => ({ id: m.id, sourcePath: m.sourcePath }));

      const built = buildLessonContent(rawMd, mediaRefs);
      const title = built.title ?? `Buổi ${number}`;
      const data = {
        subjectId: subject!.id,
        phaseId,
        slug,
        number,
        title,
        normalizedTitle: normalizeSearch(title),
        summary: null,
        durationMinutes: built.durationMinutes,
        prerequisites: built.prerequisites,
        objectives: built.objectives,
        bodyMd: built.bodyMd,
        blocks: built.blocks as unknown as object,
        blocksFormat: BLOCKS_FORMAT_VERSION,
        checklist: built.checklist,
        resources: built.resources,
        practiceSetIds: [] as string[],
        mediaCount: mediaRefs.length,
        optional: OPTIONAL_NUMBERS.has(number),
        published: true,
        order: number * 1024,
        updatedBy: null,
        deletedAt: null,
      };

      if (existing) {
        await client.roadmapLesson.update({ where: { id: lessonId }, data: { ...data, version: { increment: 1 } } });
      } else {
        await client.roadmapLesson.create({ data: { id: lessonId, ...data, version: 1 } });
      }
      lessons.push({ number, slug, title, status: existing ? "updated" : "created", mediaCount: mediaRefs.length, resourceCount: built.resources.length, warnings: built.warnings });
    }
  }

  if (!opts.dryRun && subject) {
    const created = lessons.filter((l) => l.status === "created" || l.status === "updated").length;
    const requiredPublished = lessons.filter((l) => (l.status === "created" || l.status === "updated") && !OPTIONAL_NUMBERS.has(l.number)).length;
    await client.roadmapSubject.update({
      where: { id: subject.id },
      data: { phaseCount: PHASES.length, lessonCount: created + lessons.filter((l) => l.status === "skipped-edited" || l.status === "unchanged").length, requiredLessonCount: requiredPublished },
    });
    for (const theme of PHASES) {
      const count = await client.roadmapLesson.count({ where: { subjectId: subject.id, deletedAt: null, phaseId: await ensurePhase(client, subject.id, theme) } });
      await client.roadmapPhase.updateMany({ where: { subjectId: subject.id, index: theme.index }, data: { lessonCount: count } });
    }
  }

  return { phases: PHASES.length, lessons };
}
