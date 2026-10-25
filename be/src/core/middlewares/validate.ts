import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";
import { ValidationError } from "../exceptions";

/**
 * Validate req.body với Zod schema. Dùng next(error) thay vì throw để async middleware hoạt động đúng.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(new ValidationError("Dữ liệu không hợp lệ", details));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate req.query với Zod schema.
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(new ValidationError("Tham số query không hợp lệ", details));
      return;
    }
    req.query = result.data as Request["query"];
    next();
  };
}

/**
 * Validate req.params với Zod schema.
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      next(new ValidationError("Tham số URL không hợp lệ", details));
      return;
    }
    req.params = result.data as Request["params"];
    next();
  };
}
