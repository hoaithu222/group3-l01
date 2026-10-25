import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { READ_STREAM_TYPES } from "../entities/read-state.interface";

/** `POST /read-markers` (be.md §3). `lastReadSeq` vượt `lastSeq` của luồng bị kẹp ở service, không lỗi. */
export const readMarkerSchema = z.object({
  streamType: z.enum(READ_STREAM_TYPES),
  streamId: objectIdSchema,
  lastReadSeq: z.number().int().min(0),
  deviceId: z.string().max(100).optional(),
});
export type ReadMarkerDto = z.infer<typeof readMarkerSchema>;
