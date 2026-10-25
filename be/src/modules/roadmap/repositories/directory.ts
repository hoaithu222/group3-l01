import { prisma } from "../../../infrastructure/database";
import type { RoadmapDirectory } from "../services/roadmap-integrations";

export class PrismaRoadmapDirectory implements RoadmapDirectory {
  async getRole(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return row ? row.role : null;
  }
}
