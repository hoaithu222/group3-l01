import { z } from "zod";
import { NOTIFY_MODES } from "../entities/workspace.interface";

export const workspaceMeSchema = z
  .object({
    isFavorite: z.boolean().optional(),
    position: z.number().finite().optional(),
    notifyMode: z.enum(NOTIFY_MODES).optional(),
  })
  .refine(
    (v) => v.isFavorite !== undefined || v.position !== undefined || v.notifyMode !== undefined,
    "Không có thay đổi"
  );
export type WorkspaceMeDto = z.infer<typeof workspaceMeSchema>;
