import Papa from 'papaparse';
export type CandidateRecipient = { name: string; email: string };
export type ImportSheet = { name: string; rows: string[][] };
const normal = (value: string) => value.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function detectCandidateColumns(headers: string[]) {
  const match = (aliases: string[]) => { const found = headers.flatMap((h, i) => aliases.includes(normal(h)) ? [i] : []); return found.length === 1 ? String(found[0]) : ''; };
  return { name: match(['name', 'fullname', 'candidatename', 'candidatefullname']), email: match(['email', 'emailaddress', 'emailid', 'candidateemail', 'candidateemailaddress', 'candidateemailid']) };
}
export function candidateRows(rows: string[][], nameColumn: number, emailColumn: number) {
  const seen = new Set<string>();
  return rows.slice(1).flatMap((row, index) => {
    if (row.every(value => !value.trim())) return [];
    const name = (row[nameColumn] ?? '').trim(), email = (row[emailColumn] ?? '').trim().toLowerCase();
    const error = !name || name.length > 200 || /[\r\n\u0000]/.test(name) ? 'Missing or invalid name' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ? 'Invalid email' : seen.has(email) ? 'Duplicate email' : '';
    if (!error) seen.add(email);
    return [{ row: index + 2, name, email, error }];
  });
}
export async function readCandidateFile(file: File): Promise<ImportSheet[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB');
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: 'greedy' });
    if (parsed.errors.length) throw new Error(`Could not read CSV: ${parsed.errors[0].message}`);
    if (parsed.data.length > 5001) throw new Error('Import up to 5,000 candidate rows at a time');
    return [{ name: file.name, rows: parsed.data }];
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Use CSV or Excel .xlsx. Save older .xls files as .xlsx first.');
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  return book.worksheets.map(sheet => {
    if (sheet.rowCount > 5001 || sheet.columnCount > 200) throw new Error('Each sheet must contain at most 5,000 candidates and 200 columns');
    const rows: string[][] = [];
    for (let row = 1; row <= sheet.rowCount; row++) rows.push(Array.from({ length: sheet.columnCount }, (_, column) => sheet.getRow(row).getCell(column + 1).text));
    return { name: sheet.name, rows };
  });
}
