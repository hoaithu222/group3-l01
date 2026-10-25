/**
 * Barrel của module `workspace-templates` (p5-04) — `modules/workspaces` (tạo nhóm với `templateCode`) chỉ import file này
 * (ngoại lệ có chủ đích của luật "không import chéo module", giống `@modules/channels` `createChannelBootstrap()`).
 */
import { AuditService } from "../audit-log/audit-log.service";
import { createChannelCreationPort } from "../channels";
import type { WorkspaceTemplatePort } from "../../shared/ports/workspace-template.port";
import { PrismaWorkspaceTemplateRepository } from "./workspace-templates.repo";
import { WorkspaceTemplateService } from "./workspace-templates.service";

export function createWorkspaceTemplatePort(): WorkspaceTemplatePort {
  return new WorkspaceTemplateService(new PrismaWorkspaceTemplateRepository(), createChannelCreationPort(), new AuditService());
}
