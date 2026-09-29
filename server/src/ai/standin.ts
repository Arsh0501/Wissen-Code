import type {
  AIQuestionReview, GenerateQuestionsRequest, GeneratedQuestion, InterviewPlanRequest, Observation,
  ObservationEvidence, ObservationsRequest, PlanSection,
} from './contract';
import type { AIProvider } from './provider';

/**
 * Stand-in AI provider: realistic, deterministic responses built from a curated library
 * and simple heuristics, so the product workflows work end-to-end before the real AI
 * backend is connected. Coding questions here have verified test cases.
 */

const STARTER = {
  python: `import sys\n\ndef main():\n    data = sys.stdin.read().split('\\n')\n    # TODO: parse the input and print the answer\n\nmain()\n`,
  javascript: `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');\n\n// TODO: parse the input and print the answer\n`,
  java: `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // TODO: parse the input and print the answer\n    }\n}\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // TODO: parse the input and print the answer\n    return 0;\n}\n`,
};

interface CodingTemplate {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  statement: string;
  tests: [string, string, boolean][]; // input, expected output, isSample
  solution: string;
}

export const CODING_LIBRARY: CodingTemplate[] = [
  {
    title: 'Second Highest Score',
    difficulty: 'easy',
    tags: ['arrays', 'sorting'],
    statement: `A leaderboard stores player scores. Print the **second highest distinct** score. If every score is the same (or there is only one score), print \`-1\`.

**Input**
- Line 1: integer \`n\` — number of scores
- Line 2: \`n\` space-separated integers

**Output**
A single integer.

**Constraints**
- 1 ≤ n ≤ 10⁵
- -10⁹ ≤ score ≤ 10⁹

**Example**
Input:
\`\`\`
5
40 90 90 70 10
\`\`\`
Output: \`70\``,
    tests: [
      ['5\n40 90 90 70 10', '70', true],
      ['1\n7', '-1', true],
      ['3\n5 5 5', '-1', false],
      ['4\n-3 -1 -2 -1', '-2', false],
      ['6\n1 2 3 4 5 6', '5', false],
      ['2\n1000000000 -1000000000', '-1000000000', false],
    ],
    solution: `n = int(input())\nvals = sorted(set(map(int, input().split())), reverse=True)\nprint(vals[1] if len(vals) > 1 else -1)\n`,
  },
  {
    title: 'Deepest Bracket Nesting',
    difficulty: 'easy',
    tags: ['stack', 'strings'],
    statement: `A config parser needs the maximum nesting depth of brackets. Given a string of \`(\`, \`)\`, \`[\`, \`]\`, \`{\`, \`}\`, print its **maximum nesting depth** if the brackets are balanced and correctly matched, otherwise print \`-1\`. An empty-depth valid string like \`()\` has depth 1.

**Input**
One line containing the bracket string (length 1–10⁵).

**Output**
A single integer.

**Example**
Input: \`{[()()]}\` → Output: \`3\``,
    tests: [
      ['{[()()]}', '3', true],
      ['(]', '-1', true],
      ['()', '1', false],
      ['((((', '-1', false],
      ['()[]{}', '1', false],
      ['([{}])(())', '3', false],
      ['}', '-1', false],
    ],
    solution: `s = input().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack, best = [], 0\nok = True\nfor ch in s:\n    if ch in '([{':\n        stack.append(ch)\n        best = max(best, len(stack))\n    elif not stack or stack.pop() != pairs[ch]:\n        ok = False\n        break\nprint(best if ok and not stack else -1)\n`,
  },
  {
    title: 'Longest Rising Streak',
    difficulty: 'medium',
    tags: ['arrays', 'sliding-window'],
    statement: `Daily active users are recorded for \`n\` days. Find the length of the **longest run of consecutive days** where each day's count is **strictly greater** than the previous day's.

**Input**
- Line 1: integer \`n\`
- Line 2: \`n\` space-separated integers

**Output**
The length of the longest strictly increasing contiguous run (at least 1).

**Constraints**
- 1 ≤ n ≤ 10⁵

**Example**
Input:
\`\`\`
7
3 4 5 1 2 3 4
\`\`\`
Output: \`4\``,
    tests: [
      ['7\n3 4 5 1 2 3 4', '4', true],
      ['3\n5 5 5', '1', true],
      ['1\n42', '1', false],
      ['5\n1 2 3 4 5', '5', false],
      ['5\n5 4 3 2 1', '1', false],
      ['8\n1 3 2 4 6 8 7 9', '4', false],
    ],
    solution: `n = int(input())\na = list(map(int, input().split()))\nbest = cur = 1\nfor i in range(1, n):\n    cur = cur + 1 if a[i] > a[i - 1] else 1\n    best = max(best, cur)\nprint(best)\n`,
  },
  {
    title: 'Anagram Groups',
    difficulty: 'medium',
    tags: ['hash-map', 'strings'],
    statement: `A search index groups words that are anagrams of each other (same letters, any order). Given \`n\` lowercase words, print the **number of distinct anagram groups**.

**Input**
- Line 1: integer \`n\`
- Next \`n\` lines: one lowercase word each

**Output**
A single integer.

**Constraints**
- 1 ≤ n ≤ 10⁴, word length 1–100

**Example**
Input:
\`\`\`
5
listen
silent
enlist
google
gogole
\`\`\`
Output: \`2\``,
    tests: [
      ['5\nlisten\nsilent\nenlist\ngoogle\ngogole', '2', true],
      ['3\nabc\ndef\nghi', '3', true],
      ['1\na', '1', false],
      ['4\nab\nba\nab\nba', '1', false],
      ['6\ntea\neat\nate\ntan\nnat\nbat', '3', false],
    ],
    solution: `n = int(input())\nprint(len({''.join(sorted(input().strip())) for _ in range(n)}))\n`,
  },
  {
    title: 'Meeting Rooms Required',
    difficulty: 'medium',
    tags: ['sorting', 'heap', 'intervals'],
    statement: `Given \`n\` meetings with start and end times, print the **minimum number of rooms** needed so no two overlapping meetings share a room. A meeting ending at time \`t\` frees its room for a meeting starting at \`t\`.

**Input**
- Line 1: integer \`n\`
- Next \`n\` lines: two integers \`start end\` (start < end)

**Output**
A single integer.

**Constraints**
- 1 ≤ n ≤ 10⁵, 0 ≤ start < end ≤ 10⁹

**Example**
Input:
\`\`\`
3
0 30
5 10
15 20
\`\`\`
Output: \`2\``,
    tests: [
      ['3\n0 30\n5 10\n15 20', '2', true],
      ['2\n7 10\n2 4', '1', true],
      ['1\n1 2', '1', false],
      ['3\n1 5\n5 10\n10 15', '1', false],
      ['4\n1 10\n2 9\n3 8\n4 7', '4', false],
      ['5\n1 4\n2 5\n7 9\n3 6\n8 10', '3', false],
    ],
    solution: `import heapq\nn = int(input())\nmeetings = sorted(tuple(map(int, input().split())) for _ in range(n))\nends = []\nfor s, e in meetings:\n    if ends and ends[0] <= s:\n        heapq.heapreplace(ends, e)\n    else:\n        heapq.heappush(ends, e)\nprint(len(ends))\n`,
  },
  {
    title: 'Warehouse Robot Path',
    difficulty: 'hard',
    tags: ['graphs', 'bfs', 'grid'],
    statement: `A robot moves in a warehouse grid of \`r\` rows and \`c\` columns. \`.\` is free, \`#\` is a shelf. The robot starts at the top-left cell and must reach the bottom-right cell, moving up/down/left/right one cell at a time. Print the **minimum number of moves**, or \`-1\` if it cannot be reached.

**Input**
- Line 1: integers \`r c\`
- Next \`r\` lines: a string of length \`c\`

**Output**
A single integer.

**Constraints**
- 1 ≤ r, c ≤ 1000; the start and end cells are always \`.\`

**Example**
Input:
\`\`\`
3 3
..#
#..
...
\`\`\`
Output: \`4\``,
    tests: [
      ['3 3\n..#\n#..\n...', '4', true],
      ['2 2\n.#\n#.', '-1', true],
      ['1 1\n.', '0', false],
      ['1 5\n.....', '4', false],
      ['3 4\n....\n###.\n....', '5', false],
      ['4 4\n.#..\n.#.#\n...#\n##..', '6', false],
    ],
    solution: `from collections import deque\nr, c = map(int, input().split())\ng = [input().strip() for _ in range(r)]\ndist = [[-1] * c for _ in range(r)]\ndist[0][0] = 0\nq = deque([(0, 0)])\nwhile q:\n    y, x = q.popleft()\n    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n        ny, nx = y + dy, x + dx\n        if 0 <= ny < r and 0 <= nx < c and g[ny][nx] == '.' and dist[ny][nx] < 0:\n            dist[ny][nx] = dist[y][x] + 1\n            q.append((ny, nx))\nprint(dist[r - 1][c - 1])\n`,
  },
  {
    title: 'Longest Window With K Distinct Tags',
    difficulty: 'hard',
    tags: ['sliding-window', 'hash-map', 'strings'],
    statement: `Each character of a string is an event tag. Find the length of the **longest contiguous window** that contains **at most \`k\` distinct** tags.

**Input**
- Line 1: integer \`k\` (0 ≤ k ≤ 26)
- Line 2: lowercase string \`s\` (length 1–10⁵)

**Output**
A single integer (0 if \`k\` is 0).

**Example**
Input:
\`\`\`
2
eceba
\`\`\`
Output: \`3\``,
    tests: [
      ['2\neceba', '3', true],
      ['1\naa', '2', true],
      ['0\nabc', '0', false],
      ['3\nabcabcbb', '8', false],
      ['2\nabaccc', '4', false],
      ['1\nabcde', '1', false],
    ],
    solution: `k = int(input())\ns = input().strip()\ncount, left, best = {}, 0, 0\nfor right, ch in enumerate(s):\n    count[ch] = count.get(ch, 0) + 1\n    while len(count) > k:\n        count[s[left]] -= 1\n        if count[s[left]] == 0:\n            del count[s[left]]\n        left += 1\n    best = max(best, right - left + 1)\nprint(best)\n`,
  },
];

interface McqTemplate {
  topic: string; // keyword used to match requests
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  statement: string;
  options: string[];
  correct: number[]; // indexes into options
  explanation: string;
}

export const MCQ_LIBRARY: McqTemplate[] = [
  { topic: 'javascript', difficulty: 'easy', title: 'typeof null', statement: 'What does `typeof null` evaluate to in JavaScript?', options: ['"null"', '"object"', '"undefined"', '"number"'], correct: [1], explanation: 'A long-standing quirk: `typeof null` is "object".' },
  { topic: 'javascript', difficulty: 'medium', title: 'Event loop ordering', statement: 'What is logged?\n\n```js\nconsole.log(1);\nsetTimeout(() => console.log(2), 0);\nPromise.resolve().then(() => console.log(3));\nconsole.log(4);\n```', options: ['1 2 3 4', '1 4 3 2', '1 4 2 3', '1 3 4 2'], correct: [1], explanation: 'Synchronous logs run first, then microtasks (promise), then macrotasks (timeout).' },
  { topic: 'javascript', difficulty: 'medium', title: 'Closures in loops', statement: 'What is logged?\n\n```js\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}\n```', options: ['0 1 2', '3 3 3', '0 0 0', 'undefined undefined undefined'], correct: [1], explanation: '`var` is function-scoped, so every callback sees the final value 3. `let` would log 0 1 2.' },
  { topic: 'javascript', difficulty: 'easy', title: 'Strict equality', statement: 'Which expressions evaluate to `true`? Select all that apply.', options: ['0 == ""', '0 === ""', 'null == undefined', 'NaN === NaN'], correct: [0, 2], explanation: 'Loose equality coerces 0 and "" and treats null/undefined as equal; NaN is never equal to itself.' },
  { topic: 'react', difficulty: 'easy', title: 'Why list keys matter', statement: 'Why should list items rendered in React have a stable `key`?', options: ['It is required for CSS styling', 'It lets React match items between renders so state and DOM are preserved correctly', 'It makes the list render faster on the server only', 'It prevents the component from re-rendering'], correct: [1], explanation: 'Keys identify items across renders; unstable keys cause lost state and unnecessary DOM work.' },
  { topic: 'react', difficulty: 'medium', title: 'useEffect dependencies', statement: 'A `useEffect` fetches data using a `userId` prop but has an empty dependency array `[]`. What happens when `userId` changes?', options: ['The effect re-runs automatically', 'The effect does not re-run, so stale data for the old user is shown', 'React throws an error', 'The component unmounts'], correct: [1], explanation: 'With `[]` the effect runs only on mount; `userId` must be listed as a dependency.' },
  { topic: 'react', difficulty: 'medium', title: 'State updates in one event', statement: 'Inside one click handler you call `setCount(count + 1)` three times. Starting from 0, what is `count` after the re-render?', options: ['3', '1', '0', 'It depends on the browser'], correct: [1], explanation: 'Each call uses the same stale `count`. Use the updater form `setCount(c => c + 1)` to get 3.' },
  { topic: 'react', difficulty: 'hard', title: 'When useMemo helps', statement: 'Which is the best use of `useMemo`?', options: ['Memoising every value in a component', 'Caching an expensive computation whose inputs rarely change', 'Replacing useEffect for data fetching', 'Storing mutable values between renders'], correct: [1], explanation: 'useMemo caches derived values; it is not for side effects or mutable refs (use useRef).' },
  { topic: 'dsa', difficulty: 'easy', title: 'Binary search complexity', statement: 'What is the time complexity of binary search on a sorted array of n elements?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], correct: [1], explanation: 'Each step halves the search range.' },
  { topic: 'dsa', difficulty: 'medium', title: 'Shortest path in an unweighted graph', statement: 'Which algorithm finds the shortest path (fewest edges) in an unweighted graph most directly?', options: ['Depth-first search', 'Breadth-first search', 'Kruskal\'s algorithm', 'Bubble sort'], correct: [1], explanation: 'BFS explores nodes in order of distance from the source.' },
  { topic: 'dsa', difficulty: 'medium', title: 'Top-k elements', statement: 'You need the k largest numbers from a stream of n numbers using O(k) memory. Which structure fits best?', options: ['A min-heap of size k', 'A sorted array of all n numbers', 'A queue', 'A linked list'], correct: [0], explanation: 'Keep a min-heap of size k; replace the root when a larger number arrives. O(n log k) time.' },
  { topic: 'dsa', difficulty: 'hard', title: 'Hash map worst case', statement: 'What is the worst-case lookup time in a hash map that uses chaining, and when does it happen?', options: ['O(1), always', 'O(n), when many keys collide into the same bucket', 'O(log n), when the table is full', 'O(n²), when resizing'], correct: [1], explanation: 'Heavy collisions degrade a bucket chain to a linear scan.' },
  { topic: 'sql', difficulty: 'easy', title: 'LEFT JOIN behaviour', statement: 'What does `A LEFT JOIN B` return for rows in A that have no match in B?', options: ['They are dropped', 'They are returned with NULLs for B\'s columns', 'They cause an error', 'They are duplicated'], correct: [1], explanation: 'LEFT JOIN keeps every row from the left table.' },
  { topic: 'sql', difficulty: 'medium', title: 'WHERE vs HAVING', statement: 'Which clause filters groups after aggregation?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], correct: [1], explanation: 'WHERE filters rows before grouping; HAVING filters aggregated groups.' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rotate<T>(arr: T[], seed: number): T[] {
  if (!arr.length) return arr;
  const k = seed % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

function mcqTopicFor(req: GenerateQuestionsRequest): string {
  const text = `${req.topic} ${req.skills.join(' ')}`.toLowerCase();
  if (/react|hook|jsx|component/.test(text)) return 'react';
  if (/javascript|\bjs\b|node|typescript|frontend/.test(text)) return 'javascript';
  if (/sql|database|postgres|mysql|query/.test(text)) return 'sql';
  return 'dsa';
}

function byDifficulty<T extends { difficulty: string }>(items: T[], difficulty: string): T[] {
  if (difficulty === 'mixed') return items;
  const exact = items.filter((i) => i.difficulty === difficulty);
  return exact.length ? exact : items;
}

function toCoding(t: CodingTemplate, req: GenerateQuestionsRequest): GeneratedQuestion {
  return {
    type: 'coding',
    title: t.title,
    difficulty: t.difficulty,
    topic: req.topic,
    skills: req.skills.length ? req.skills.slice(0, 5) : t.tags,
    tags: t.tags,
    statement: t.statement,
    testCases: t.tests.map(([input, expectedOutput, isSample]) => ({ input, expectedOutput, isSample })),
    starterCode: STARTER,
    referenceSolution: t.solution,
    options: [],
    correctOptionIds: [],
    explanation: '',
  };
}

function toMcq(t: McqTemplate, req: GenerateQuestionsRequest): GeneratedQuestion {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  return {
    type: 'mcq',
    title: t.title,
    difficulty: t.difficulty,
    topic: req.topic,
    skills: req.skills.length ? req.skills.slice(0, 5) : [t.topic],
    tags: [t.topic, 'mcq'],
    statement: t.statement,
    testCases: [],
    starterCode: { python: '', javascript: '', java: '', cpp: '' },
    referenceSolution: '',
    options: t.options.map((text, i) => ({ id: ids[i], text })),
    correctOptionIds: t.correct.map((i) => ids[i]),
    explanation: t.explanation,
  };
}

// ── Review heuristics ───────────────────────────────────────────────

const VAGUE = /\b(etc\.?|some|somehow|maybe|appropriate(ly)?|as needed|and so on|various)\b/i;

function reviewCoding(q: GeneratedQuestion): AIQuestionReview {
  const text = q.statement.toLowerCase();
  const ambiguityIssues: string[] = [];
  if (!/\binput\b/.test(text)) ambiguityIssues.push('The input format is not described.');
  if (!/\boutput\b/.test(text)) ambiguityIssues.push('The output format is not described.');
  if (!/constraint|≤|<=/.test(text)) ambiguityIssues.push('No constraints are given, so the expected efficiency is unclear.');
  if (VAGUE.test(q.statement)) ambiguityIssues.push(`Vague wording found: "${q.statement.match(VAGUE)![0]}".`);
  if (q.statement.length < 120) ambiguityIssues.push('The statement is very short; candidates may need more detail.');

  const correctnessIssues: string[] = [];
  const samples = q.testCases.filter((t) => t.isSample);
  if (samples.length && !samples.some((t) => q.statement.includes(t.expectedOutput.split('\n')[0]))) {
    correctnessIssues.push('No sample output appears in the statement\u2019s example; check the example matches the sample tests.');
  }

  // Difficulty from algorithmic signals in the statement and tags
  const signals = `${text} ${q.tags.join(' ')}`;
  const hard = /graph|bfs|dfs|dynamic programming|\bdp\b|10⁵|10\^5|sliding|heap|shortest/.test(signals);
  const medium = /sort|hash|map|stack|interval|window|10⁴/.test(signals);
  const assessedDifficulty = hard && (q.difficulty === 'hard' || /graph|bfs|shortest|dynamic/.test(signals)) ? 'hard' : hard || medium ? 'medium' : 'easy';

  // Missing edge cases, judged from the test inputs
  const inputs = q.testCases.map((t) => t.input);
  const tokens = inputs.join(' ').split(/\s+/);
  const edge: { input: string; reason: string }[] = [];
  const hasTiny = inputs.some((i) => i.trim().split(/\s+/).length <= 2);
  if (!hasTiny) edge.push({ input: 'Smallest valid input (e.g. a single element)', reason: 'No test uses the minimum input size.' });
  if (tokens.some((t) => /^\d+$/.test(t)) && !tokens.some((t) => /^-\d+$/.test(t)) && /-10|negative|≤ score|-10⁹/.test(q.statement)) {
    edge.push({ input: 'Input with negative numbers', reason: 'The constraints allow negatives but no test contains one.' });
  }
  const hasDup = inputs.some((i) => { const w = i.split(/\s+/).slice(1); return new Set(w).size < w.length; });
  if (!hasDup) edge.push({ input: 'Input with repeated values', reason: 'No test contains duplicate values.' });
  if (!/10⁵|10\^5|100000|10⁹/.test(inputs.join(' ')) && /10⁵|10⁹/.test(q.statement)) {
    edge.push({ input: 'Input near the upper constraint', reason: 'Large inputs are allowed but untested, so slow solutions could pass.' });
  }

  return {
    correctness: correctnessIssues.length
      ? { status: 'warn', message: 'Possible mismatch between the statement and its tests.', details: correctnessIssues }
      : { status: 'pass', message: 'Statement, example and sample tests are consistent.' },
    ambiguity: ambiguityIssues.length
      ? { status: 'warn', message: `${ambiguityIssues.length} wording issue${ambiguityIssues.length === 1 ? '' : 's'} could confuse candidates.`, details: ambiguityIssues }
      : { status: 'pass', message: 'Input, output and constraints are clearly specified.' },
    assessedDifficulty,
    suggestedEdgeCases: edge.slice(0, 4),
  };
}

function reviewMcq(q: GeneratedQuestion): AIQuestionReview {
  const ambiguity: string[] = [];
  const correctness: string[] = [];
  if (q.statement.trim().length < 15) ambiguity.push('The question is very short.');
  if (VAGUE.test(q.statement)) ambiguity.push(`Vague wording found: "${q.statement.match(VAGUE)![0]}".`);
  if (q.options.some((o) => /all of the above|none of the above/i.test(o.text))) ambiguity.push('"All/None of the above" options make answers ambiguous.');
  if (q.correctOptionIds.length > 1 && !/select all|all that apply|choose all|which (of the following )?(are|expressions)/i.test(q.statement)) {
    correctness.push('Several options are marked correct, but the question does not say to select all that apply.');
  }
  const lengths = q.options.map((o) => o.text.length);
  const correctLen = q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text.length);
  if (correctLen.length === 1 && lengths.length > 2 && correctLen[0] > 2 * Math.max(...lengths.filter((l) => l !== correctLen[0]))) {
    ambiguity.push('The correct option is much longer than the others, which can give the answer away.');
  }
  return {
    correctness: correctness.length
      ? { status: 'warn', message: 'The answer key may not match the question.', details: correctness }
      : { status: 'pass', message: 'The marked answer is consistent with the question.' },
    ambiguity: ambiguity.length
      ? { status: 'warn', message: `${ambiguity.length} wording issue${ambiguity.length === 1 ? '' : 's'} found.`, details: ambiguity }
      : { status: 'pass', message: 'The question and options are clearly worded.' },
    assessedDifficulty: q.difficulty,
    suggestedEdgeCases: [],
  };
}

// ── Interview planning ──────────────────────────────────────────────

const QUESTION_BANK: Record<string, string[]> = {
  react: ['Walk me through how you would structure state for a form with dependent fields.', 'When does a component re-render, and how would you stop unnecessary re-renders?', 'How do you handle data fetching, loading and error states in React?'],
  javascript: ['Explain closures with an example from your own work.', 'How does the event loop decide what runs next?', 'What is the difference between == and ===, and when would you use each?'],
  typescript: ['How do you model a value that can be one of several shapes?', 'When would you use `unknown` instead of `any`?'],
  dsa: ['Find the first non-repeating character in a string. Talk through complexity.', 'Given intervals, merge the overlapping ones.', 'Detect a cycle in a linked list.'],
  debugging: ['Here is a function that returns wrong results for some inputs. How would you find the bug?', 'A page is slow only in production. How do you investigate?'],
  'system design': ['Design a URL shortener. What are the main components and trade-offs?', 'How would you add caching to a read-heavy API?'],
  sql: ['Write a query for the top 3 customers by revenue per month.', 'How would you speed up a slow query?'],
  node: ['How do you handle errors in an Express API consistently?', 'How would you process a large file without running out of memory?'],
  communication: ['Explain a technical decision you made to a non-technical stakeholder.'],
  'problem solving': ['Describe the hardest bug you have fixed and how you approached it.'],
};

function questionsFor(skill: string): string[] {
  const key = skill.toLowerCase();
  const match = Object.keys(QUESTION_BANK).find((k) => key.includes(k) || k.includes(key));
  return match ? QUESTION_BANK[match] : [`Tell me about a project where you used ${skill}. What was hard?`, `How would you explain ${skill} to a new team member?`];
}

function planInterview(req: InterviewPlanRequest): { sections: PlanSection[]; rationale: string } {
  const text = `${req.jobRequirements} ${req.role}`.toLowerCase();
  // Skills mentioned in the job requirements get more time; follow-ups reserve ~10%
  const followUps = Math.max(3, Math.round(req.durationMinutes * 0.1));
  const available = req.durationMinutes - followUps;
  const weights = req.skills.map((s) => (text.includes(s.toLowerCase()) ? 1.5 : 1) * (/dsa|algorithm|problem/i.test(s) ? 1.3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const minutes = weights.map((w) => Math.max(3, Math.round((w / total) * available)));
  // Fix rounding so the plan adds up to the requested duration exactly
  let diff = available - minutes.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0 && i < 1000; i++) {
    const idx = i % minutes.length;
    if (diff > 0) { minutes[idx]++; diff--; } else if (minutes[idx] > 3) { minutes[idx]--; diff++; }
  }
  const years = Number(req.candidateExperience.match(/(\d+)\+?\s*(years|yrs)/i)?.[1] ?? NaN);
  const level = Number.isFinite(years) ? (years >= 6 ? 'senior' : years >= 2 ? 'mid-level' : 'junior') : 'the stated';
  const sections: PlanSection[] = req.skills.map((skill, i) => ({
    topic: skill,
    minutes: minutes[i],
    goals: `Assess practical ${skill} depth at a ${level} level${text.includes(skill.toLowerCase()) ? ' — called out in the job requirements' : ''}.`,
    questions: questionsFor(skill).slice(0, minutes[i] >= 10 ? 3 : 2),
  }));
  sections.push({ topic: 'Follow-ups', minutes: followUps, goals: 'Clarify weak spots and let the candidate ask questions.', questions: ['What would you do differently if you solved that again?', 'What questions do you have for us?'] });
  return {
    sections,
    rationale: `Time is split across the ${req.skills.length} required skills, weighting skills named in the job requirements and problem-solving more heavily, with ${followUps} minutes reserved for follow-ups. Questions target a ${level} candidate.`,
  };
}

// ── Observations ────────────────────────────────────────────────────

function firstSentence(text: string): string {
  const s = text.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

function observe(req: ObservationsRequest): Observation[] {
  const out: Observation[] = [];
  const primary = req.skills[0] ?? 'Problem Solving';
  const codeLines = req.code.split('\n').filter((l) => l.trim());

  if (req.executionResult) {
    const ok = /accepted|success|ok/i.test(req.executionResult.status) && !req.executionResult.stderr.trim();
    const evidence: ObservationEvidence[] = [{ source: 'execution', quote: req.executionResult.status, detail: req.executionResult.timeSeconds !== null ? `${req.executionResult.timeSeconds}s` : undefined }];
    if (!ok && req.executionResult.stderr.trim()) evidence.push({ source: 'execution', quote: req.executionResult.stderr.trim().split('\n').slice(-1)[0].slice(0, 200) });
    out.push({
      skill: primary,
      sentiment: ok ? 'positive' : 'concern',
      observation: ok ? 'The code ran successfully on the last execution.' : 'The last run failed; check whether the candidate diagnosed the error.',
      evidence,
    });
  }

  if (codeLines.length) {
    const fn = codeLines.find((l) => /\b(def|function|const \w+ = \(|class|public static)\b/.test(l));
    // Guard clauses: "if not x:", "if (!x)", "if x == 0 / None / []", "len(x) == 0", "x.length === 0"
    const edgePattern = /if\s+not\s+\w+|if\s*\(\s*!\s*\w+|if\s*\(?\s*\w+(\.length)?\s*(==|===|<=|<|is)\s*(0|1|None|null|undefined|\[\]|'')|len\(\w+\)\s*(==|<=|<)\s*[01]|\.length\s*(===?|<=|<)\s*[01]/;
    const hasEdgeHandling = edgePattern.test(req.code);
    const debugging = req.skills.find((s) => /debug/i.test(s)) ?? 'Debugging';
    out.push({
      skill: primary,
      sentiment: fn ? 'positive' : 'neutral',
      observation: fn ? 'Code is organised into named units, which makes it easier to follow.' : 'The code is written as a single script without helper functions.',
      evidence: [{ source: 'code', quote: (fn ?? codeLines[0]).trim().slice(0, 160), detail: `line ${req.code.split('\n').indexOf(fn ?? codeLines[0]) + 1}` }],
    });
    out.push({
      skill: debugging,
      sentiment: hasEdgeHandling ? 'positive' : 'concern',
      observation: hasEdgeHandling ? 'Handles empty or boundary inputs explicitly.' : 'No explicit handling of empty or boundary inputs was found.',
      evidence: [{ source: 'code', quote: hasEdgeHandling ? (codeLines.find((l) => edgePattern.test(l)) ?? codeLines[0]).trim().slice(0, 160) : `${codeLines.length} non-empty lines, no guard clauses`, detail: hasEdgeHandling ? undefined : 'whole submission' }],
    });
  }

  if (req.answer.trim()) {
    const words = req.answer.trim().split(/\s+/).length;
    const mentionsComplexity = /o\([^)]+\)|complexity|time and space|big.?o/i.test(req.answer);
    const communication = req.skills.find((s) => /communicat/i.test(s)) ?? 'Communication';
    out.push({
      skill: communication,
      sentiment: words >= 40 ? 'positive' : 'neutral',
      observation: words >= 40 ? 'Explained the approach in detail.' : 'The explanation was brief; consider probing for reasoning.',
      evidence: [{ source: 'answer', quote: firstSentence(req.answer), detail: `${words} words` }],
    });
    if (mentionsComplexity) {
      out.push({ skill: primary, sentiment: 'positive', observation: 'Discussed time/space complexity unprompted.', evidence: [{ source: 'answer', quote: req.answer.match(/[^.]*(o\([^)]+\)|complexity)[^.]*\.?/i)![0].trim().slice(0, 200) }] });
    }
  }

  if (req.notes.trim()) {
    out.push({ skill: primary, sentiment: 'neutral', observation: 'Interviewer noted the following; weigh it alongside the evidence above.', evidence: [{ source: 'notes', quote: firstSentence(req.notes) }] });
  }
  return out;
}

export const standInProvider: AIProvider = {
  name: 'stand-in',

  async generateQuestions(req) {
    const seed = hash(`${req.topic}|${req.skills.join(',')}|${req.difficulty}|${Date.now() >> 16}`);
    const coding = rotate(byDifficulty(CODING_LIBRARY, req.difficulty), seed);
    const topic = mcqTopicFor(req);
    const mcqPool = MCQ_LIBRARY.filter((m) => m.topic === topic);
    const mcq = rotate(byDifficulty(mcqPool.length ? mcqPool : MCQ_LIBRARY, req.difficulty), seed);
    const out: GeneratedQuestion[] = [];
    for (let i = 0; i < req.count; i++) {
      const wantMcq = req.questionType === 'mcq' || (req.questionType === 'mixed' && i % 2 === 1);
      const pool = wantMcq ? mcq : coding;
      const pick = pool[Math.floor(i / (req.questionType === 'mixed' ? 2 : 1)) % pool.length];
      out.push(wantMcq ? toMcq(pick as McqTemplate, req) : toCoding(pick as CodingTemplate, req));
    }
    // Drop exact repeats when the library is smaller than the request
    return out.filter((q, i) => out.findIndex((o) => o.title === q.title) === i);
  },

  async reviewQuestion(q) {
    return q.type === 'mcq' ? reviewMcq(q) : reviewCoding(q);
  },

  async planInterview(req) {
    return planInterview(req);
  },

  async observe(req) {
    return observe(req);
  },
};
