import { expect, it } from 'vitest';
import { sortByCreatedAt } from './listSort';

it('orders by creation time in both directions without mutating source data', () => {
  const rows = [
    { id: 30, createdAt: '2026-01-01T12:00:00Z' },
    { id: 10, createdAt: '2026-03-01T12:00:00Z' },
    { id: 20, createdAt: '2026-02-01T12:00:00Z' },
  ];
  expect(sortByCreatedAt(rows, 'newest').map((row) => row.id)).toEqual([10, 20, 30]);
  expect(sortByCreatedAt(rows, 'oldest').map((row) => row.id)).toEqual([30, 20, 10]);
  expect(rows.map((row) => row.id)).toEqual([30, 10, 20]);
});

it('handles equal dates and missing/invalid dates deterministically', () => {
  const rows = [
    { id: 1 },
    { id: 2, createdAt: 'invalid' },
    { id: 3, createdAt: '2026-01-01' },
    { id: 4, createdAt: '2026-01-01' },
  ];
  expect(sortByCreatedAt(rows, 'newest').map((row) => row.id)).toEqual([4, 3, 2, 1]);
  expect(sortByCreatedAt(rows, 'oldest').map((row) => row.id)).toEqual([3, 4, 1, 2]);
});
