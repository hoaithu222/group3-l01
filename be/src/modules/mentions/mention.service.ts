import { prisma } from "../../infrastructure/database";
import { redis } from "../../infrastructure/redis";
import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { LIMITS } from "../../core/constants/limits";
import type {
  IMentionValidator,
  MentionValidateInput,
  MentionValidateResult,
  MentionHookValidatedItem,
} from "../../core/permission";
import { getMessageScope } from "../messages/public";
import { parseMarkers, buildTextForSearch, mentionKey, type ParsedMarker } from "./mention.parser";
import { RoleMentionPolicy, roleMentionLabel } from "./role-mention.policy";

/**
 * Rank vai trò hội thoại nhóm — mirror `conversation-presenter.ts#RANK`/
 * `conversation.scope-resolver.ts#RANK` (không import trực tiếp module
 * `conversations`, giống 2 nơi kia tự khai lại). Export để
 * `mentionables.service.ts` (CÙNG module `mentions`) dùng lại, tránh khai 3
 * lần trong 1 module.
 */
export const CONVERSATION_ROLE_RANK: Record<"OWNER" | "ADMIN" | "MEMBER", number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

function mismatchError(): AppError {
  return new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, { reason: "MISMATCH" });
}

function tooManyError(): AppError {
  return new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, { reason: "TOO_MANY" });
}

/**
 * be.md §5.2 `MentionService.validate()` — cài đặt THẬT (thay bản cấu trúc
 * tối giản `messages/services/mention-validator.ts` của p1-04) cho port
 * `IMentionValidator` (`core/permission/message-hooks.port.ts`). Đăng ký qua
 * `registerMentionValidator(new MentionService())` (`modules/mentions/index.ts`).
 */
export class MentionService implements IMentionValidator {
  constructor(private readonly roleMentions: RoleMentionPolicy = new RoleMentionPolicy()) {}

  async validate(input: MentionValidateInput): Promise<MentionValidateResult> {
    const { scopeType, scopeId, mentions, content, actorId, messageId } = input;

    // ── Bước 1: marker ↔ mentions[] phải khớp 1-1 (không trùng, không lệch) ──
    const markers = parseMarkers(content);
    const markerKeySet = new Set(markers.map((m) => mentionKey(m.type, m.targetId)));

    const inputKeys = mentions.map((m) => mentionKey(m.type, m.targetId ?? null));
    const inputKeySet = new Set(inputKeys);
    if (inputKeySet.size !== mentions.length) throw mismatchError(); // trùng target trong mentions[]
    if (inputKeySet.size !== markerKeySet.size) throw mismatchError();
    for (const key of inputKeySet) {
      if (!markerKeySet.has(key)) throw mismatchError();
    }

    // ── Bước 2: tổng số lượt nhắc khác nhau ≤ mentionsMax ──────────────────
    if (inputKeySet.size > LIMITS.message.mentionsMax) throw tooManyError();

    // ── Bước 3: USER — kiểm target đọc được phạm vi qua hook tuỳ chọn của scope ──
    const userMentions = mentions.filter((m) => m.type === "USER" && m.targetId);
    const scope = getMessageScope(scopeType);
    if (userMentions.length > 0 && scope?.validateMentions) {
      const deep = await scope.validateMentions(
        scopeId,
        userMentions.map((m) => ({ type: "USER" as const, targetId: m.targetId as string }))
      );
      if (!deep.valid) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
          reason: "INVALID_TARGET",
          invalidMentions: (deep.invalidMentions ?? []).map((m) => ({
            targetId: m.targetId ?? null,
            reason: "NO_ACCESS",
          })),
        });
      }
    }

    // ── Bước 3b: USER phải tồn tại + tài khoản ACTIVE (be.md §5.2 bước 3
    // "+ user ACTIVE", reason NOT_FOUND) — tra theo id (không theo tên, MSG-34)
    // TRƯỚC khi tính quota `@all` để 1 target hỏng không "đốt" lượt của người gửi.
    const userIds = [...new Set(userMentions.map((m) => m.targetId as string))];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, status: true } })
        : [];
    const nameById = new Map(users.filter((u) => u.status === "ACTIVE").map((u) => [u.id, u.name]));
    const notFoundIds = userIds.filter((id) => !nameById.has(id));
    if (notFoundIds.length > 0) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
        reason: "INVALID_TARGET",
        invalidMentions: notFoundIds.map((targetId) => ({ targetId, reason: "NOT_FOUND" })),
      });
    }

    // ── Bước 4: @all — chỉ GROUP, role ≥ mentionAllRole, rate limit ────────
    const hasAll = mentions.some((m) => m.type === "ALL");
    if (hasAll) {
      await this.assertCanMentionAll(scopeType, scopeId, actorId);
    }

    // ── Bước 5: @role (p3-04) — chỉ trong kênh, quyền `workspace.mention.role`, hạn mức/giờ ─────────────
    await this.roleMentions.assertAllowed({ scopeType, scopeId, actorId, messageId, mentions });

    // ── Bước 6: build kết quả (label = ảnh chụp tên hiện tại) ──────────────
    const validated: MentionHookValidatedItem[] = mentions.map((m) => {
      if (m.type === "USER") {
        return { type: "USER", targetId: m.targetId ?? null, label: nameById.get(m.targetId ?? "") ?? null };
      }
      if (m.type === "ALL") {
        return { type: "ALL", targetId: null, label: null };
      }
      return { type: "ROLE", targetId: m.targetId ?? null, label: roleMentionLabel(m.targetId) };
    });

    // Tự tag chính mình giữ trong `mentions` nhưng loại khỏi `mentionUserIds` (be.md §5.2).
    const mentionUserIds = userIds.filter((id) => id !== actorId);

    const textForSearch = buildTextForSearch(content, markers, (marker: ParsedMarker) => {
      if (marker.type === "USER") return nameById.get(marker.targetId ?? "") ?? "người dùng";
      if (marker.type === "ALL") return "tất cả";
      return roleMentionLabel(marker.targetId) ?? marker.targetId ?? "vai trò";
    });

    return { mentions: validated, mentionUserIds, mentionAll: hasAll, textForSearch };
  }

  /**
   * be.md §5.2 bước 4 — `@all` chỉ dùng được ở hội thoại NHÓM (`kind=GROUP`),
   * vai trò actor ≥ `settings.mentionAllRole` (mirror
   * `conversation-presenter.ts#computeMyPermissions` rank logic — không gọi
   * lại hàm đó vì nó tính CẢ khối `ConversationMyPermissions` không cần ở
   * đây, giống cách `conversation.scope-resolver.ts` cũng tự khai lại `RANK`
   * thay vì import). Kênh/DIRECT → luôn `MSG_020`. Rate limit Redis
   * `mention-all:<actor>:<conv>` 5 lần/giờ → `MSG_021`.
   */
  private async assertCanMentionAll(
    scopeType: MentionValidateInput["scopeType"],
    scopeId: string,
    actorId: string
  ): Promise<void> {
    if (scopeType !== "CONVERSATION") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_020], 403, ErrorCode.MSG_020);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: scopeId },
      select: { kind: true, settings: true },
    });
    if (!conversation || conversation.kind !== "GROUP") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_020], 403, ErrorCode.MSG_020);
    }

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: scopeId, userId: actorId } },
      select: { role: true, status: true },
    });
    const rank = member && member.status === "ACTIVE" ? CONVERSATION_ROLE_RANK[member.role] : 0;
    const mentionAllRole = (conversation.settings as { mentionAllRole?: "ADMIN" | "MEMBER" }).mentionAllRole ?? "ADMIN";
    const requiredRank = CONVERSATION_ROLE_RANK[mentionAllRole];
    if (rank < requiredRank) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_020], 403, ErrorCode.MSG_020);
    }

    const rateLimitKey = `mention-all:${actorId}:${scopeId}`;
    const count = await redis.incr(rateLimitKey);
    if (count !== null) {
      if (count === 1) await redis.expire(rateLimitKey, 3600);
      if (count > LIMITS.mention.allPerHour) {
        throw new AppError(ErrorMessages[ErrorCode.MSG_021], 429, ErrorCode.MSG_021, { retryAfterSeconds: 3600 });
      }
    }
  }
}
