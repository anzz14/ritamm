import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { z } from "zod";

import { ParseError } from "../../core/errors.js";

export interface PositionedText {
  s: string;
  x: number;
  y: number;
  r: number;
}

export interface VisualLine {
  y: number;
  items: PositionedText[];
}

export interface Page {
  lines: VisualLine[];
}

const textItemSchema = z.object({
  str: z.string(),
  transform: z.array(z.unknown()),
  width: z.number().finite()
});

export function groupTextItems(items: PositionedText[]): VisualLine[] {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: VisualLine[] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line.y - item.y) <= 2) {
      line.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map((line) => ({
    y: line.y,
    items: [...line.items].sort((left, right) => left.x - right.x)
  }));
}

function positionedText(item: unknown): PositionedText | undefined {
  const parsed = textItemSchema.safeParse(item);
  if (!parsed.success || parsed.data.str.trim() === "") return undefined;
  const x = parsed.data.transform[4];
  const y = parsed.data.transform[5];
  if (typeof x !== "number" || typeof y !== "number") {
    throw new ParseError("PDF text item has an invalid transform");
  }
  return { s: parsed.data.str.trim(), x, y, r: x + parsed.data.width };
}

interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

type DocumentLoader = typeof getDocument;

export async function extractLines(buffer: Buffer | Uint8Array, loader: DocumentLoader = getDocument): Promise<Page[]> {
  const loadingTask = loader({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 });
  const document = await loadingTask.promise as unknown as PdfDocument;
  const pages: Page[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.map(positionedText).filter((item): item is PositionedText => item !== undefined);
    pages.push({ lines: groupTextItems(items) });
  }
  return pages;
}