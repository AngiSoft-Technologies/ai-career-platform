import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import PptxGenJS from "pptxgenjs";
import sharp from "sharp";

export type DocumentFormat = "pdf" | "docx" | "pptx" | "png";
export type DocumentTemplate = "classic" | "modern" | "minimal";

export interface ExportableDocument {
  title: string;
  subtitle?: string;
  sections: Array<{
    heading?: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  metadata?: Record<string, string>;
}

export const EXPORT_MIME: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
};

function wrapText(text: string, maxChars = 78): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

const DOCUMENT_HEADINGS = new Set([
  "contact", "summary", "professional summary", "profile", "objective", "experience",
  "work experience", "employment", "education", "skills", "core skills", "technical skills",
  "projects", "certifications", "awards", "languages", "volunteering", "publications",
  "target role", "references",
]);

export function contentToExportSections(content: string): ExportableDocument["sections"] {
  const sections: ExportableDocument["sections"] = [];
  let heading: string | undefined;
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (!heading && !text) return;
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const bullets = lines.filter((line) => /^[-*•·]\s+/.test(line)).map((line) => line.replace(/^[-*•·]\s+/, ""));
    const paragraphs = bullets.length === lines.length ? [] : [text];
    sections.push({ heading, paragraphs, bullets: bullets.length === lines.length ? bullets : [] });
    body = [];
  };

  for (const line of content.split(/\r?\n/)) {
    const candidate = line.trim().replace(/^#{1,3}\s+/, "").replace(/:$/, "");
    const normalized = candidate.toLowerCase();
    const isHeading = candidate.length > 0 && candidate.length <= 60 && DOCUMENT_HEADINGS.has(normalized);
    if (isHeading) {
      flush();
      heading = candidate;
    } else if (!line.trim()) {
      body.push("");
    } else {
      body.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ paragraphs: [content] }];
}

export async function renderPdf(
  document: ExportableDocument,
  template: DocumentTemplate = "classic",
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const palette = template === "modern"
    ? { title: "#0f766e", heading: "#115e59", rule: "#99f6e4", margin: 54 }
    : template === "minimal"
      ? { title: "#111827", heading: "#374151", rule: "#d1d5db", margin: 72 }
      : { title: "#0f172a", heading: "#0f172a", rule: "#d7dde6", margin: 64 };
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: palette.margin, right: palette.margin },
  });

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.font("Helvetica-Bold").fontSize(template === "minimal" ? 22 : 19).fillColor(palette.title).text(document.title, { align: "left" });
  if (document.subtitle) {
    doc.moveDown(0.2).font("Helvetica").fontSize(11).fillColor("#3f4a56").text(document.subtitle);
  }
  doc.moveDown(0.6).moveTo(palette.margin, doc.y).lineTo(531 + (64 - palette.margin), doc.y).strokeColor(palette.rule).stroke();
  doc.moveDown(0.8);

  for (const section of document.sections) {
    if (section.heading) {
      doc.font("Helvetica-Bold").fontSize(template === "minimal" ? 11 : 12.5).fillColor(palette.heading).text(section.heading);
      doc.moveDown(0.25);
    }
    for (const paragraph of section.paragraphs) {
      doc.font("Helvetica").fontSize(10).fillColor("#1f2937");
      doc.text(wrapText(paragraph, 88).join("\n"), { align: "left", lineGap: 2 });
      doc.moveDown(0.4);
    }
    for (const bullet of section.bullets ?? []) {
      doc.font("Helvetica").fontSize(10).fillColor("#1f2937");
      doc.text(`•  ${wrapText(bullet, 82).join("\n      ")}`, { lineGap: 1.5 });
      doc.moveDown(0.15);
    }
    doc.moveDown(0.5);
  }

  if (document.metadata) {
    doc.moveDown(0.4).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.3);
    for (const [key, value] of Object.entries(document.metadata)) {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#6b7280").text(key.toUpperCase(), { continued: false });
      doc.font("Helvetica").fontSize(8).fillColor("#6b7280").text(value);
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    setTimeout(() => resolve(Buffer.concat(chunks)), 0);
  });
}

export async function renderDocx(
  document: ExportableDocument,
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: document.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
    }),
  ];

  if (document.subtitle) {
    children.push(
      new Paragraph({
        text: document.subtitle,
        spacing: { after: 160 },
      }),
    );
  }

  for (const section of document.sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 260, after: 120 },
        }),
      );
    }
    for (const paragraph of section.paragraphs) {
      children.push(new Paragraph({ text: paragraph, spacing: { after: 140 } }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(
        new Paragraph({
          text: bullet,
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
      );
    }
  }

  if (document.metadata) {
    for (const [key, value] of Object.entries(document.metadata)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${key}: `, bold: true, size: 16, color: "6B7280" }),
            new TextRun({ text: value, size: 16, color: "6B7280" }),
          ],
          spacing: { after: 40 },
        }),
      );
    }
  }

  const file = new Document({
    title: document.title,
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(file);
  return Buffer.from(buffer);
}

export async function renderPptx(
  document: ExportableDocument,
): Promise<Buffer> {
  const presentation = new PptxGenJS();
  presentation.title = document.title;

  const slide = presentation.addSlide();
  slide.addText(document.title, {
    x: 0.5,
    y: 0.5,
    w: 9,
    fontSize: 28,
    bold: true,
    color: "0F172A",
  });

  if (document.subtitle) {
    slide.addText(document.subtitle, {
      x: 0.5,
      y: 1.4,
      w: 9,
      fontSize: 13,
      color: "4B5563",
    });
  }

  let cursor = document.subtitle ? 2.1 : 1.6;

  for (const section of document.sections) {
    if (cursor > 6.4) {
      const page = presentation.addSlide();
      page.addText(document.title, {
        x: 0.5,
        y: 0.4,
        w: 9,
        fontSize: 16,
        bold: true,
        color: "0F172A",
      });
      cursor = 1.2;
    }

    if (section.heading) {
      slide.addText(section.heading, {
        x: 0.5,
        y: cursor,
        w: 9,
        fontSize: 15,
        bold: true,
        color: "0F172A",
      });
      cursor += 0.42;
    }

    for (const paragraph of section.paragraphs) {
      slide.addText(wrapText(paragraph, 92).join(" "), {
        x: 0.5,
        y: cursor,
        w: 9,
        fontSize: 11,
        color: "1F2937",
      });
      cursor += 0.3;
    }

    for (const bullet of section.bullets ?? []) {
      slide.addText(`•  ${bullet}`, {
        x: 0.6,
        y: cursor,
        w: 8.8,
        fontSize: 10.5,
        color: "374151",
      });
      cursor += 0.28;
    }

    cursor += 0.25;
  }

  const output = await presentation.write({ outputType: "nodebuffer" });
  return output as Buffer;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function documentToSvg(document: ExportableDocument): Promise<string> {
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">`,
    `<rect width="1240" height="1754" fill="#ffffff"/>`,
    `<text x="80" y="110" font-family="Inter, Helvetica, Arial" font-size="38" font-weight="700" fill="#0f172a">${escapeXml(document.title)}</text>`,
  );

  let y = 175;

  if (document.subtitle) {
    lines.push(
      `<text x="80" y="${y}" font-family="Inter, Helvetica, Arial" font-size="21" fill="#4b5563">${escapeXml(document.subtitle)}</text>`,
      `<line x1="80" y1="${y + 28}" x2="1160" y2="${y + 28}" stroke="#d7dde6" stroke-width="2"/>`,
    );
    y += 78;
  }

  const body: Array<{ text: string; size: number; weight: string; fill: string; indent: number }> = [];
  for (const section of document.sections) {
    if (section.heading) {
      body.push({ text: section.heading, size: 26, weight: "700", fill: "#0f172a", indent: 0 });
    }
    for (const paragraph of section.paragraphs) {
      body.push({ text: paragraph, size: 19, weight: "400", fill: "#1f2937", indent: 0 });
    }
    for (const bullet of section.bullets ?? []) {
      body.push({ text: `•  ${bullet}`, size: 18, weight: "400", fill: "#374151", indent: 24 });
    }
  }

  for (const line of body) {
    const wrapped = wrapText(line.text, 82);
    for (const text of wrapped) {
      if (y > 1660) break;
      lines.push(
        `<text x="${80 + line.indent}" y="${y}" font-family="Inter, Helvetica, Arial" font-size="${line.size}" font-weight="${line.weight}" fill="${line.fill}">${escapeXml(text)}</text>`,
      );
      y += Math.round(line.size * 1.5);
    }
    y += 12;
  }

  lines.push("</svg>");
  return lines.join("\n");
}

export async function renderImage(
  document: ExportableDocument,
): Promise<Buffer> {
  const svg = await documentToSvg(document);
  return sharp(Buffer.from(svg), { density: 150 })
    .png({ quality: 90 })
    .toBuffer();
}

export async function renderDocument(
  document: ExportableDocument,
  format: DocumentFormat,
  template: DocumentTemplate = "classic",
): Promise<{ body: Buffer; mimeType: string; extension: string }> {
  switch (format) {
    case "pdf":
      return { body: await renderPdf(document, template), mimeType: EXPORT_MIME.pdf, extension: "pdf" };
    case "docx":
      return { body: await renderDocx(document), mimeType: EXPORT_MIME.docx, extension: "docx" };
    case "pptx":
      return { body: await renderPptx(document), mimeType: EXPORT_MIME.pptx, extension: "pptx" };
    case "png":
      return { body: await renderImage(document), mimeType: EXPORT_MIME.png, extension: "png" };
    default:
      throw new Error("UNSUPPORTED_FORMAT");
  }
}
