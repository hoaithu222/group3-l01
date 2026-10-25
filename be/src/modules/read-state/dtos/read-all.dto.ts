import { z } from "zod";

/** `POST /me/read-all-conversations` — `before` (ISO) do client chốt lúc bấm; tin đến sau đó vẫn chưa đọc (NT-13). */
export const readAllConversationsSchema = z.object({ before: z.string().datetime() });
export type ReadAllConversationsDto = z.infer<typeof readAllConversationsSchema>;
