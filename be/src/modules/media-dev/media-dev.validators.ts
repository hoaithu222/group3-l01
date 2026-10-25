import { z } from "zod";

/** `POST /dev/media/spike-token` — `room` chỉ a-z, 0-9, gạch nối; server tự thêm tiền tố `spike_`. */
export const spikeTokenSchema = z
  .object({
    room: z.string().regex(/^[a-z0-9-]{3,32}$/, "Tên phòng gồm a-z, 0-9, gạch nối (3–32 ký tự)"),
    publish: z
      .object({ audio: z.boolean(), video: z.boolean(), screen: z.boolean() })
      .default({ audio: true, video: true, screen: false }),
  })
  .strict();
export type SpikeTokenDto = z.infer<typeof spikeTokenSchema>;
