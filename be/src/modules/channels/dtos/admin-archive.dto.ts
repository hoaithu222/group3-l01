import type { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

export const adminChannelArchiveSchema = reasonSchema;
export type AdminChannelArchiveDto = z.infer<typeof adminChannelArchiveSchema>;
