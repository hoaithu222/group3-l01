import { extensionOf, isConvertible, resolveResourceType } from "../services/resource-type.resolver";

describe("resource-type.resolver", () => {
  it("MIME nhị phân → type native", () => {
    expect(resolveResourceType("application/pdf", "pdf")).toEqual({ type: "PDF", language: null, previewStatus: "NATIVE" });
    expect(resolveResourceType("image/png", "png").type).toBe("IMAGE");
    expect(resolveResourceType("video/mp4", "mp4").type).toBe("VIDEO");
    expect(resolveResourceType("audio/mpeg", "mp3").type).toBe("AUDIO");
  });

  it("text/plain + đuôi code → CODE + ngôn ngữ; đuôi khác/không đuôi → TEXT", () => {
    expect(resolveResourceType("text/plain", "ts")).toEqual({ type: "CODE", language: "typescript", previewStatus: "NATIVE" });
    expect(resolveResourceType("text/plain", "py").language).toBe("python");
    expect(resolveResourceType("text/plain", "h").language).toBe("c");
    expect(resolveResourceType("text/plain", "yml").language).toBe("yaml");
    expect(resolveResourceType("text/plain", "txt")).toEqual({ type: "TEXT", language: null, previewStatus: "NATIVE" });
    expect(resolveResourceType("text/plain", null).type).toBe("TEXT");
    expect(resolveResourceType("text/plain", "exe").type).toBe("TEXT"); // đuôi lạ không thành CODE
  });

  it("markdown/json luôn là CODE dù đuôi gì; CSV là SHEET xem thẳng dạng văn bản", () => {
    expect(resolveResourceType("text/markdown", null)).toMatchObject({ type: "CODE", language: "markdown" });
    expect(resolveResourceType("application/json", "txt")).toMatchObject({ type: "CODE", language: "json" });
    expect(resolveResourceType("text/csv", "csv")).toEqual({ type: "SHEET", language: null, previewStatus: "NATIVE" });
  });

  it("Office → DOC/SLIDE/SHEET chưa có bản xem trước (NONE, convertible); MIME lạ → OTHER/UNSUPPORTED", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const pptx = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    expect(resolveResourceType(docx, "docx")).toEqual({ type: "DOC", language: null, previewStatus: "NONE" });
    expect(resolveResourceType(pptx, "pptx").type).toBe("SLIDE");
    expect(resolveResourceType(xlsx, "xlsx").type).toBe("SHEET");
    expect(resolveResourceType("application/zip", "zip")).toEqual({ type: "OTHER", language: null, previewStatus: "UNSUPPORTED" });
    expect(isConvertible("DOC") && isConvertible("SLIDE") && isConvertible("SHEET")).toBe(true);
    expect(isConvertible("PDF")).toBe(false);
  });

  it("extensionOf: chữ thường, ≤ 10 ký tự chữ-số; ẩn/không đuôi/đuôi lạ → null", () => {
    expect(extensionOf("Bài Giảng.PDF")).toBe("pdf");
    expect(extensionOf("a.tar.gz")).toBe("gz");
    expect(extensionOf(".bashrc")).toBeNull();
    expect(extensionOf("khong-duoi")).toBeNull();
    expect(extensionOf("cham-cuoi.")).toBeNull();
    expect(extensionOf("x.qua-dai-khong-hop-le")).toBeNull();
  });
});
