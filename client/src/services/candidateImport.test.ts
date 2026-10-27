import { expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { candidateRows, detectCandidateColumns, readCandidateFile } from './candidateImport';

it('matches reordered headers, ignores extra columns, and flags invalid or duplicate recipients', () => {
  const rows = [
    ['Department', 'EMAIL ADDRESS', 'Candidate Name'],
    ['Engineering', 'MAYA@EXAMPLE.COM', 'Maya'],
    ['HR', 'maya@example.com', 'Duplicate'],
    ['IT', 'bad-email', 'Sam'],
    ['IT', 'sam@example.com', ''],
  ];
  expect(detectCandidateColumns(rows[0])).toEqual({ name: '2', email: '1' });
  const result = candidateRows(rows, 2, 1);
  expect(result[0]).toMatchObject({ name: 'Maya', email: 'maya@example.com', error: '' });
  expect(result.slice(1).map((row) => row.error)).toEqual([
    'Duplicate email',
    'Invalid email',
    'Missing or invalid name',
  ]);
  expect(detectCandidateColumns(['Name', 'Email', 'Email Address'])).toEqual({
    name: '0',
    email: '',
  });
});

it('reads quoted CSV and leaves column mapping independent of column order', async () => {
  const file = {
    name: 'candidates.csv',
    size: 100,
    text: async () => '\uFEFFEmail,Other,Full Name\r\nmaya@example.com,ignored,"Maya, Rao"\r\n',
  } as File;
  const sheets = await readCandidateFile(file);
  const mapping = detectCandidateColumns(sheets[0].rows[0]);
  expect(
    candidateRows(sheets[0].rows, Number(mapping.name), Number(mapping.email))[0],
  ).toMatchObject({ name: 'Maya, Rao', email: 'maya@example.com', error: '' });
});

it('reads Excel worksheets and rejects unsupported or oversized files', async () => {
  const workbook = new Workbook();
  workbook.addWorksheet('Candidates').addRows([
    ['Email ID', 'Score', 'Name'],
    ['maya@example.com', 90, 'Maya'],
  ]);
  workbook.addWorksheet('Second group').addRows([
    ['Name', 'Email'],
    ['Sam', 'sam@example.com'],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  const sheets = await readCandidateFile({
    name: 'candidates.xlsx',
    size: buffer.byteLength,
    arrayBuffer: async () => new Uint8Array(buffer as unknown as ArrayBuffer).buffer,
  } as File);
  expect(sheets.map((sheet) => sheet.name)).toEqual(['Candidates', 'Second group']);
  expect(detectCandidateColumns(sheets[0].rows[0])).toEqual({ name: '2', email: '0' });
  await expect(readCandidateFile({ name: 'old.xls', size: 100 } as File)).rejects.toThrow(
    'Save older .xls',
  );
  await expect(readCandidateFile({ name: 'large.csv', size: 6000000 } as File)).rejects.toThrow(
    '5 MB',
  );
});
