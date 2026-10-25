import { LIMITS } from "../../../core/constants/limits";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { PlaintextPayload } from "./document-events";
import { extractPlainText } from "./yjs-text";

export type PlaintextOutcome = "done" | "stale" | "missing";

/**
 * Job `document.plaintext` (queue `reports`, be.md §7): trích văn bản phẳng từ `yjsState` → `plainText`/`normalizedText`/`wordCount`.
 * Idempotent và tự bỏ việc cũ: chỉ chạy khi `yjsVersion` của job vẫn là bản HIỆN TẠI (bản mới hơn có job riêng), ghi bằng CAS theo `yjsVersion`.
 */
export class DocumentPlaintextService {
  constructor(private readonly documents: Pick<IDocumentRepository, "findWithState" | "updatePlainText">) {}

  async process(payload: PlaintextPayload): Promise<PlaintextOutcome> {
    const doc = await this.documents.findWithState(payload.documentId);
    if (!doc) return "missing";
    if (doc.yjsVersion !== payload.yjsVersion) return "stale";
    const { text, normalizedText, wordCount } = extractPlainText(doc.yjsState, LIMITS.document.plainTextMaxBytes);
    const written = await this.documents.updatePlainText(doc.id, doc.yjsVersion, { plainText: text, normalizedText, wordCount });
    return written ? "done" : "stale";
  }
}
