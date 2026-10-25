/**
 * Schema OpenAPI của kho tài liệu (p3-01) — `swagger-jsdoc` quét `src/modules/**` (`app.ts`). File chỉ chứa chú thích.
 *
 * @openapi
 * components:
 *   schemas:
 *     FolderDto:
 *       type: object
 *       required: [id, workspaceId, parentId, name, depth, version, createdBy, createdAt, updatedAt, canModify]
 *       properties:
 *         id: { type: string }
 *         workspaceId: { type: string }
 *         parentId: { type: string, nullable: true }
 *         name: { type: string }
 *         depth: { type: integer, minimum: 1, maximum: 8, description: "Gốc = 1" }
 *         version: { type: integer }
 *         createdBy: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *         deletedAt: { type: string, format: date-time, nullable: true }
 *         canModify: { type: boolean, description: "Server tính: người xem có sửa/xoá/di chuyển được không" }
 *     ResourceDto:
 *       type: object
 *       required: [id, workspaceId, folderId, name, type, mime, size, previewStatus, uploadedBy, version, canModify]
 *       properties:
 *         id: { type: string }
 *         workspaceId: { type: string }
 *         folderId: { type: string, nullable: true }
 *         name: { type: string }
 *         extension: { type: string, nullable: true }
 *         type: { type: string, enum: [PDF, IMAGE, VIDEO, AUDIO, CODE, DOC, SHEET, SLIDE, TEXT, OTHER] }
 *         language: { type: string, nullable: true, description: "CODE: ngôn ngữ tô màu" }
 *         mime: { type: string }
 *         size: { type: integer }
 *         description: { type: string, nullable: true }
 *         tags: { type: array, items: { type: string } }
 *         previewStatus: { type: string, enum: [NONE, NATIVE, PENDING, READY, FAILED, UNSUPPORTED] }
 *         thumbnailUrl: { type: string, nullable: true, description: "Ảnh: URL ký ≤ 60 s" }
 *         uploadedBy:
 *           type: object
 *           properties:
 *             id: { type: string }
 *             name: { type: string }
 *             avatarUrl: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *         version: { type: integer }
 *         deletedAt: { type: string, format: date-time, nullable: true }
 *         canModify: { type: boolean }
 *         folderPath: { type: string, description: "CHỈ ở kết quả tìm (q): tên thư mục từ gốc tới thư mục chứa tệp, nối bằng ' / '; rỗng khi ở gốc kho" }
 *     StorageUsageDto:
 *       type: object
 *       required: [usedBytes, quotaBytes, quotaSource, fileCount, folderCount, trashBytes, byType]
 *       properties:
 *         usedBytes: { type: number }
 *         quotaBytes: { type: number }
 *         quotaSource: { type: string, enum: [DEFAULT, OVERRIDE] }
 *         fileCount: { type: integer }
 *         folderCount: { type: integer }
 *         trashBytes: { type: number, description: "Vẫn tính vào usedBytes tới khi xoá vĩnh viễn" }
 *         byType:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type: { type: string }
 *               count: { type: integer }
 *               bytes: { type: number }
 */
export {};
