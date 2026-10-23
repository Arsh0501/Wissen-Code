import { PDFParse } from 'pdf-parse';

export async function extractResumeText(pdfDataUrl: string): Promise<string> {
  const parser = new PDFParse({
    data: new Uint8Array(Buffer.from(pdfDataUrl.split(',')[1], 'base64')),
    isEvalSupported: false,
  });
  try {
    const result = await parser.getText({ first: 20, pageJoiner: '\n' });
    return result.pages.map((page) => page.text).join('\n').replace(/\u0000/g, '').trim();
  } finally {
    await parser.destroy();
  }
}
