import type { StudyItem, StudyItemTypeValue, FillMatchModeValue, StudyOption } from "../entities/study-item.interface";
import { GRADABLE_MASK } from "../entities/study-item.interface";
import type { StudySet, StudySetStatusValue, StudyVisibilityValue } from "../entities/study-set.interface";
import type { StudyUserRef } from "../repositories/user-directory";
import type { StudySetPermissions } from "./study-set-access";

export interface StudySetSummaryDto {
  id: string;
  ownerId: string;
  owner: StudyUserRef | null;
  workspaceId: string | null;
  title: string;
  description: string | null;
  tags: string[];
  coverAssetId: string | null;
  /** Thumbnail ký ≤ 60 s của ảnh bìa (`null` = chưa có ảnh hoặc chưa xử lý xong). */
  coverThumbUrl: string | null;
  language: string | null;
  visibility: StudyVisibilityValue;
  status: StudySetStatusValue;
  itemCount: number;
  /** Có ít nhất một câu chấm điểm được (thi thử/live quiz dùng được). */
  hasQuiz: boolean;
  copyCount: number;
  copiedFromId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudySetDto extends StudySetSummaryDto {
  itemTypesMask: number;
  /** Chỉ tác giả và OWNER/ADMIN nhóm (người ẩn) thấy lý do — người khác không thấy bộ đã ẩn. */
  hiddenReason: string | null;
  hiddenAt: Date | null;
}

export interface StudySetMyPermissions {
  edit: boolean;
  delete: boolean;
  duplicate: boolean;
  report: boolean;
  hide: boolean;
  unhide: boolean;
}

/**
 * `srEnrolled` = NGƯỜI XEM đang đăng ký ôn theo lịch bộ này (`SrEnrollment.active`, p4-02) — app chỉ hiện "Ngừng ôn bộ này" khi `true`, còn `false` thì hiện "Ôn theo lịch".
 * Tính theo người xem (không phải thuộc tính của bộ) nên KHÔNG có ở danh sách/tóm tắt.
 */
export type StudySetDetailDto = StudySetDto & { myPermissions: StudySetMyPermissions; srEnrolled: boolean };

export interface PresentContext {
  owners: ReadonlyMap<string, StudyUserRef>;
  thumbs: ReadonlyMap<string, string>;
}

export function toSummaryDto(set: StudySet, ctx: PresentContext): StudySetSummaryDto {
  return {
    id: set.id,
    ownerId: set.ownerId,
    owner: ctx.owners.get(set.ownerId) ?? null,
    workspaceId: set.workspaceId,
    title: set.title,
    description: set.description,
    tags: set.tags,
    coverAssetId: set.coverAssetId,
    coverThumbUrl: set.coverAssetId ? (ctx.thumbs.get(set.coverAssetId) ?? null) : null,
    language: set.language,
    visibility: set.visibility,
    status: set.status,
    itemCount: set.itemCount,
    hasQuiz: (set.itemTypesMask & GRADABLE_MASK) !== 0,
    copyCount: set.copyCount,
    copiedFromId: set.copiedFromId,
    version: set.version,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  };
}

export function toSetDto(set: StudySet, ctx: PresentContext, viewerId: string, perms: StudySetPermissions): StudySetDto {
  const seeReason = set.ownerId === viewerId || perms.unhide;
  return {
    ...toSummaryDto(set, ctx),
    itemTypesMask: set.itemTypesMask,
    hiddenReason: seeReason ? set.hiddenReason : null,
    hiddenAt: seeReason ? set.hiddenAt : null,
  };
}

export function toDetailDto(set: StudySet, ctx: PresentContext, viewerId: string, perms: StudySetPermissions, srEnrolled = false): StudySetDetailDto {
  return {
    ...toSetDto(set, ctx, viewerId, perms),
    srEnrolled,
    myPermissions: {
      edit: perms.edit,
      delete: perms.delete,
      duplicate: perms.duplicate,
      report: perms.report,
      hide: perms.hide,
      unhide: perms.unhide,
    },
  };
}

/** Mục học kèm ĐÁP ÁN — chỉ trả cho người đọc được nội dung bộ (chế độ học). Mock test/live quiz dùng DTO riêng KHÔNG đáp án. */
export interface StudyItemDto {
  id: string;
  setId: string;
  type: StudyItemTypeValue;
  prompt: string;
  answerText: string | null;
  options: StudyOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: FillMatchModeValue;
  explanation: string | null;
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  audioAssetId: string | null;
  tags: string[];
  order: number;
  version: number;
  updatedAt: Date;
}

/** Whitelist trường (không spread entity) — `ownerId` không lộ ra ngoài. */
export function toItemDto(item: StudyItem): StudyItemDto {
  return {
    id: item.id,
    setId: item.setId,
    type: item.type,
    prompt: item.prompt,
    answerText: item.answerText,
    options: item.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })),
    correctOptionIds: item.correctOptionIds,
    acceptedAnswers: item.acceptedAnswers,
    matchMode: item.matchMode,
    explanation: item.explanation,
    frontMediaAssetId: item.frontMediaAssetId,
    backMediaAssetId: item.backMediaAssetId,
    audioAssetId: item.audioAssetId,
    tags: item.tags,
    order: item.order,
    version: item.version,
    updatedAt: item.updatedAt,
  };
}
