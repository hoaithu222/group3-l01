import { listMessagesQuerySchema, type ListMessagesQueryDto } from "../../messages/public";

/** be.md §3 — `threadQuerySchema = listMessagesQuerySchema` (p1-04), tái sử dụng NGUYÊN VẸN (beforeSeq/afterSeq/around/limit). */
export const threadQuerySchema = listMessagesQuerySchema;
export type ThreadQueryDto = ListMessagesQueryDto;
