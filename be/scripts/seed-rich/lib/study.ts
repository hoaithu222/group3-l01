import { normalizeSearch } from "../../../src/core/utils/normalize";
import { TRUE_OPTION_ID, FALSE_OPTION_ID, typesMask, type StudyItemContent } from "../../../src/modules/study/entities/study-item.interface";
import { newOptionId } from "../../../src/modules/study/services/study-item.builder";
import { normalizeTags } from "../../../src/modules/study/services/study-tags";
import type { StudyItemSpec } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";
import type { WorkspaceCtx } from "./workspace";

function buildItemContent(item: StudyItemSpec): StudyItemContent {
  const tags = normalizeTags(item.tags ?? []);
  const common = { frontMediaAssetId: null, backMediaAssetId: null, audioAssetId: null, tags };
  switch (item.type) {
    case "FLASHCARD":
      return { ...common, explanation: null, type: "FLASHCARD", prompt: item.prompt, answerText: item.answerText, options: [], correctOptionIds: [], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
    case "MULTIPLE_CHOICE": {
      if (item.correctIndex < 0 || item.correctIndex >= item.options.length) throw new Error(`correctIndex không hợp lệ: "${item.prompt}"`);
      const options = item.options.map((text) => ({ id: newOptionId(), text, mediaAssetId: null }));
      return { ...common, explanation: item.explanation ?? null, type: "MULTIPLE_CHOICE", prompt: item.prompt, answerText: null, options, correctOptionIds: [options[item.correctIndex].id], acceptedAnswers: [], matchMode: "IGNORE_CASE" };
    }
    case "TRUE_FALSE":
      return {
        ...common,
        explanation: item.explanation ?? null,
        type: "TRUE_FALSE",
        prompt: item.prompt,
        answerText: null,
        options: [
          { id: TRUE_OPTION_ID, text: "Đúng", mediaAssetId: null },
          { id: FALSE_OPTION_ID, text: "Sai", mediaAssetId: null },
        ],
        correctOptionIds: [item.correct ? TRUE_OPTION_ID : FALSE_OPTION_ID],
        acceptedAnswers: [],
        matchMode: "IGNORE_CASE",
      };
    case "FILL_BLANK":
      return { ...common, explanation: item.explanation ?? null, type: "FILL_BLANK", prompt: item.prompt, answerText: null, options: [], correctOptionIds: [], acceptedAnswers: [...item.accepted], matchMode: "IGNORE_CASE" };
  }
}

/** Bộ học của nhóm. Nhận diện bằng tag `seed-rich:<slug>` của chủ bộ — có rồi thì bỏ qua, không bao giờ ghi đè bộ đã tồn tại. */
export interface SeededSet {
  id: string;
  ownerKey: string;
  visibility: "WORKSPACE" | "PUBLIC";
  createdAt: Date;
}

export async function seedStudySets(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<{ sets: number; items: number; created: SeededSet[] }> {
  let sets = 0;
  let items = 0;
  const created: SeededSet[] = [];
  for (const spec of ctx.spec.studySets) {
    const ownerId = dir.id(spec.owner);
    const seedTag = `seed-rich:${spec.slug}`;
    if (await prisma.studySet.findFirst({ where: { ownerId, tags: { has: seedTag } }, select: { id: true } })) continue;

    const contents = spec.items.map(buildItemContent);
    const rng = rngFrom(`study:${spec.slug}`);
    const life = Math.max(now.getTime() - ctx.createdAt.getTime(), DAY_MS);
    const createdAt = new Date(ctx.createdAt.getTime() + Math.floor(life * (0.1 + rng() * 0.6)));
    const set = await prisma.studySet.create({
      data: {
        ownerId,
        workspaceId: ctx.id,
        title: spec.title,
        normalizedTitle: normalizeSearch(spec.title),
        description: spec.description,
        tags: normalizeTags([...spec.tags, seedTag]),
        language: spec.language,
        visibility: spec.visibility,
        status: "ACTIVE",
        itemCount: contents.length,
        itemTypesMask: typesMask(contents.map((c) => c.type)),
        // Quy ước Mongo null-vs-absent (study-set.repository.prisma.ts#create).
        hiddenReason: null,
        hiddenBy: null,
        hiddenAt: null,
        deletedAt: null,
        createdAt,
      },
    });
    await prisma.studyItem.createMany({
      data: contents.map((content, index) => ({ ...content, setId: set.id, ownerId, order: (index + 1) * 10, createdAt })),
    });
    sets += 1;
    items += contents.length;
    created.push({ id: set.id, ownerKey: spec.owner, visibility: spec.visibility, createdAt });
  }
  return { sets, items, created };
}
