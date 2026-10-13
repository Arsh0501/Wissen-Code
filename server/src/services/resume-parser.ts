import * as pdfParseModule from 'pdf-parse';

export interface ExtractedPdfResult {
  text: string;
  numPages: number;
  info?: Record<string, any>;
}

/**
 * Extracts plain text from an uploaded PDF Buffer in memory.
 * Seamlessly handles both modern and legacy pdf-parse versions.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractedPdfResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded PDF file is empty');
  }

  // Modern pdf-parse v2+ (PDFParse class)
  if ((pdfParseModule as any).PDFParse) {
    const PDFParse = (pdfParseModule as any).PDFParse;
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const text = textResult?.text ? textResult.text.replace(/\r\n/g, '\n').trim() : '';
      return {
        text,
        numPages: textResult?.total || 1,
      };
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  // Legacy pdf-parse v1 (functional)
  const fn = typeof (pdfParseModule as any) === 'function'
    ? (pdfParseModule as any)
    : (pdfParseModule as any).default;

  if (typeof fn === 'function') {
    const parsed = await fn(buffer);
    const text = parsed.text ? parsed.text.replace(/\r\n/g, '\n').trim() : '';
    return {
      text,
      numPages: parsed.numpages || 1,
      info: parsed.info,
    };
  }

  throw new Error('Unable to initialize PDF parser from pdf-parse module');
}
