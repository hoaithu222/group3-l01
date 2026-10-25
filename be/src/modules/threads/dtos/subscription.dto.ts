import { z } from "zod";

/** be.md §3 — `PUT /threads/:id/subscription`. */
export const subscriptionSchema = z.object({ state: z.enum(["EXPLICIT_ON", "EXPLICIT_OFF"]) }).strict();
export type SubscriptionDto = z.infer<typeof subscriptionSchema>;
