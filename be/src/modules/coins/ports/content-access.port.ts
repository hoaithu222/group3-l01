import { prisma } from "../../../infrastructure/database";
import { newObjectId } from "../../../core/utils/object-id";
import { coinErrors } from "../coins.errors";
import type { ListingContentTypeValue } from "../entities/coins.interface";
import { PrismaTxRunner, type ITxRunner } from "../repositories/tx";

export interface ContentEligibility {
  title: string;
  description: string | null;
}

export interface ContentPreviewItem {
  prompt: string;
  type: string;
}

export interface GrantAccessResult {
  kind: "STUDY_SET_COPY" | "RESOURCE_ENTITLEMENT";
  /** STUDY_SET: id bộ học MỚI (bản sao) của người mua. RESOURCE: `contentId` gốc (xem ghi chú `note`). */
  accessRef: string;
  /** Chỉ có ở RESOURCE — P1 CHƯA có hạ tầng cấp quyền đọc tệp chéo nhóm (xem ghi chú cuối file). */
  note?: string;
}

/**
 * Cổng quyền nội dung chợ tài liệu (p7-02 be.md §5 "Listing create"/"Listing buy", P1) — `study` (p4-01) và `resources` (p3-01) CHƯA xuất khẩu qua `public.ts` một API "kiểm sở hữu +
 * nhân bản/cấp quyền cho người mua tuỳ ý" (chỉ có `createStudyContentReader()` cho ĐỌC đã kiểm `canView`, không phải nhân bản). Vì phạm vi worker này CHỈ gồm `modules/coins` +
 * `modules/users|gamification` (điểm neo hồ sơ công khai) + `router.ts`, cổng này đọc/ghi TRỰC TIẾP bảng `StudySet`/`StudyItem`/`Resource` (như tiền lệ `PrismaCoinsDirectory` đọc `User`) —
 * ĐÂY LÀ QUYẾT ĐỊNH PHẠM VI, xem báo cáo bàn giao. Về lâu dài nên chuyển sang gọi `@modules/study/public` khi module đó bổ sung hàm nhân bản dùng chung.
 *
 * STUDY_SET: mua = nhân bản NGAY một bộ học mới (PRIVATE) về tài khoản người mua — cùng dữ liệu `StudySetDuplicateService` (module `study`) tạo ra, nhưng KHÔNG gắn `AssetLink` mới cho
 * ảnh bìa/ảnh mục (asset gốc vẫn `foreignReadable` từ khi listing yêu cầu `visibility PUBLIC`, nên bản sao xem ảnh được qua liên kết asset đã có — không tự thu hồi khi seller đổi bộ gốc
 * sang PRIVATE, đúng ghi chú COIN-05 "study set duplicate giữ lại").
 *
 * RESOURCE: `Resource` gắn theo `workspaceId` cố định và quyền đọc asset đi qua `AssetLink` (`targetType RESOURCE`, MỘT dòng duy nhất mỗi resource — unique `(assetId, targetType, targetId)`).
 * Cấp một bản quyền đọc THỨ HAI cho người mua (khác nhóm với người bán) đòi hỏi thêm giá trị `AssetLinkTarget`/logic resolver mà module `assets` chưa có, và việc thêm enum Prisma nằm
 * NGOÀI phạm vi worker này (không sửa `schema.prisma`). P1 vì vậy DỪNG Ở mức: ghi nhận đã mua + trả về mã nội dung gốc; tải tệp thật cần việc tiếp theo (thêm `AssetLinkTarget` phù hợp +
 * resolver ở `assets`/`resources`) — đã nêu trong báo cáo bàn giao.
 */
export interface IContentAccessPort {
  /** Ném `coinErrors.contentNotEligible()` (COIN_006) nếu không sở hữu hoặc không đủ điều kiện niêm yết. */
  assertEligible(sellerId: string, contentType: ListingContentTypeValue, contentId: string): Promise<ContentEligibility>;
  /** `null` khi loại nội dung không có preview theo mục (RESOURCE). */
  preview(contentType: ListingContentTypeValue, contentId: string): Promise<ContentPreviewItem[] | null>;
  grantAccess(buyerId: string, contentType: ListingContentTypeValue, contentId: string): Promise<GrantAccessResult>;
}

export class PrismaContentAccessPort implements IContentAccessPort {
  constructor(private readonly tx: ITxRunner = new PrismaTxRunner()) {}

  async assertEligible(sellerId: string, contentType: ListingContentTypeValue, contentId: string): Promise<ContentEligibility> {
    if (contentType === "STUDY_SET") {
      const set = await prisma.studySet.findUnique({ where: { id: contentId } });
      if (!set || set.deletedAt || set.ownerId !== sellerId || set.status !== "ACTIVE" || set.visibility !== "PUBLIC") throw coinErrors.contentNotEligible();
      return { title: set.title, description: set.description };
    }
    const resource = await prisma.resource.findUnique({ where: { id: contentId } });
    if (!resource || resource.deletedAt || resource.uploadedBy !== sellerId) throw coinErrors.contentNotEligible();
    return { title: resource.name, description: resource.description };
  }

  async preview(contentType: ListingContentTypeValue, contentId: string): Promise<ContentPreviewItem[] | null> {
    if (contentType !== "STUDY_SET") return null;
    const items = await prisma.studyItem.findMany({ where: { setId: contentId }, orderBy: { order: "asc" }, take: 3 });
    return items.map((i) => ({ prompt: i.prompt, type: i.type }));
  }

  async grantAccess(buyerId: string, contentType: ListingContentTypeValue, contentId: string): Promise<GrantAccessResult> {
    if (contentType === "RESOURCE") {
      return {
        kind: "RESOURCE_ENTITLEMENT",
        accessRef: contentId,
        note: "Đã ghi nhận quyền mua — tải tệp gốc cần hạ tầng cấp quyền chéo nhóm (chưa sẵn sàng ở P1), liên hệ người bán trong lúc chờ.",
      };
    }
    const source = await prisma.studySet.findUnique({ where: { id: contentId } });
    if (!source) throw coinErrors.notFound("Không tìm thấy bộ học");
    const items = await prisma.studyItem.findMany({ where: { setId: contentId }, orderBy: { order: "asc" } });
    const id = newObjectId();
    await this.tx.run(async (tx) => {
      await tx.studySet.create({
        data: {
          id,
          ownerId: buyerId,
          workspaceId: null,
          title: source.title,
          normalizedTitle: source.normalizedTitle,
          description: source.description,
          tags: [...source.tags],
          coverAssetId: source.coverAssetId,
          language: source.language,
          visibility: "PRIVATE",
          status: "ACTIVE",
          itemCount: items.length,
          itemTypesMask: source.itemTypesMask,
          copiedFromId: source.id,
        },
      });
      if (items.length > 0) {
        await tx.studyItem.createMany({
          data: items.map((i) => ({
            id: newObjectId(),
            setId: id,
            ownerId: buyerId,
            order: i.order,
            type: i.type,
            prompt: i.prompt,
            answerText: i.answerText,
            options: i.options,
            correctOptionIds: [...i.correctOptionIds],
            acceptedAnswers: [...i.acceptedAnswers],
            matchMode: i.matchMode,
            explanation: i.explanation,
            frontMediaAssetId: i.frontMediaAssetId,
            backMediaAssetId: i.backMediaAssetId,
            audioAssetId: i.audioAssetId,
            tags: [...i.tags],
          })),
        });
      }
    });
    return { kind: "STUDY_SET_COPY", accessRef: id };
  }
}
