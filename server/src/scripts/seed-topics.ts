import '../config/environment';
import { z } from 'zod';
import prisma from '../prisma';
import { structuredAI } from '../services/structured-ai';
import { questionGenerationSchema, starterCodesFrom } from '../services/workflow-schemas';

/**
 * Seeds the question bank with one AI-written coding question per topic.
 *   npm run db:seed-topics                 (needs OPENAI_* configured; Groq free tier works)
 * Questions are tagged ai-generated + unverified until a live judge runs the solutions.
 */
const TOPICS: [string, 'easy' | 'medium' | 'hard'][] = [
  ['Array: Maximum Product Subarray (contiguous subarray with the largest product)', 'medium'],
  ['Arrays: index-based access and in-place manipulation', 'easy'],
  ['Singly linked list operations (insert, delete, reverse)', 'easy'],
  ['Doubly linked list with prev/next pointers', 'medium'],
  ['Circular linked list (last node points to the first)', 'medium'],
  ['Stack (LIFO): balanced brackets or next greater element', 'easy'],
  ['Simple queue (FIFO) simulation', 'easy'],
  ['Circular queue with fixed capacity', 'medium'],
  ['Priority queue: dequeue by priority rather than insertion order', 'medium'],
  ['Deque (double-ended queue): sliding window maximum', 'medium'],
  ['Binary tree properties (height, diameter, level order)', 'easy'],
  ['Binary search tree: insert, search, validate ordering', 'medium'],
  ['AVL tree rotations and balance factors', 'hard'],
  ['Red-black tree properties and insertion recolouring', 'hard'],
  ['B-tree / B+ tree node splitting and ordered keys', 'hard'],
  ['Trie (prefix tree) for autocomplete or prefix counting', 'medium'],
  ['Heap (min-heap / max-heap): k smallest elements', 'medium'],
  ['Directed graph: cycle detection or topological order', 'medium'],
  ['Undirected graph: connected components', 'easy'],
  ['Weighted graph: minimum cost path with edge weights', 'medium'],
  ['Unweighted graph: fewest edges between two nodes', 'easy'],
  ['Hash table / hash map: counting, grouping or two-sum style lookups', 'easy'],
  ['Linear search over an unsorted list', 'easy'],
  ['Binary search on a sorted array (first/last occurrence)', 'easy'],
  ['Exponential search on a sorted array', 'medium'],
  ['Interpolation search on uniformly distributed sorted data', 'medium'],
  ['Bubble sort: count swaps or passes', 'easy'],
  ['Selection sort: trace the array after k passes', 'easy'],
  ['Insertion sort: count shifts', 'easy'],
  ['Merge sort: count inversions', 'medium'],
  ['QuickSort partition scheme', 'medium'],
  ['Heap sort', 'medium'],
  ['Counting sort for bounded integers', 'easy'],
  ['Radix sort for non-negative integers', 'medium'],
  ['Depth-first search (DFS) on a grid or graph', 'medium'],
  ['Breadth-first search (BFS): shortest steps in a grid', 'medium'],
  ['Binary tree traversals: in-order, pre-order, post-order', 'easy'],
  ["Dijkstra's algorithm: single-source shortest paths", 'medium'],
  ['Bellman-Ford algorithm with negative edges', 'hard'],
  ['Floyd-Warshall all-pairs shortest paths', 'hard'],
  ["Kruskal's minimum spanning tree with union-find", 'medium'],
  ["Prim's minimum spanning tree", 'medium'],
  ['Divide and conquer: maximum subarray or closest pair style', 'medium'],
  ['Dynamic programming: Fibonacci-style recurrence or 0/1 knapsack', 'medium'],
  ['Greedy algorithms: Huffman coding cost or interval scheduling', 'medium'],
  ['Backtracking: N-Queens count or subsets', 'hard'],
];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' } });
  if (!admin) throw new Error('No admin user found');
  const added: string[] = [];
  const skipped: string[] = [];
  // TOPIC_OFFSET=n skips the first n topics (resume after an interrupted run).
  // Re-runs skip topics that already produced a question, so an interrupted run resumes cleanly.
  const seeded = new Set(
    (
      await prisma.question.findMany({
        where: { settings: { path: ['seedTopic'], not: 'null' } },
        select: { settings: true },
      })
    ).map((q) => (q.settings as any)?.seedTopic),
  );
  for (const [topic, difficulty] of TOPICS.slice(Number(process.env.TOPIC_OFFSET || 0))) {
    if (seeded.has(topic)) {
      console.log(`= already seeded: ${topic.slice(0, 48)}`);
      continue;
    }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const bank = await prisma.question.findMany({
          select: { title: true, statement: true },
          orderBy: { id: 'desc' },
          take: 150,
        });
        const out = await structuredAI(
          'generated_questions',
          z.object({ questions: z.array(questionGenerationSchema) }),
          'Write one original, unambiguous coding question for the given topic, suitable for a timed online assessment. Give exact stdin/stdout specifications, constraints, at least one sample and two hidden test cases, a correct Python 3 reference solution and a short explanation. Provide starter code that reads stdin and prints stdout in Python (starterCodePython), C++ (starterCodeCpp), Java (starterCodeJava, class Main) and JavaScript (starterCodeJavaScript, Node.js). Do not repeat the supplied existing questions.',
          {
            topic,
            difficulty,
            questionType: 'coding',
            count: 1,
            requiredSkills: ['Python', 'data structures and algorithms'],
            existingQuestions: bank.map((q) => ({ title: q.title, statement: q.statement.slice(0, 160) })),
          },
        );
        const q = out.questions[0];
        if (!q) throw new Error('empty output');
        const hasSample = q.testCases.some((t) => t.isSample) && q.testCases.some((t) => !t.isSample);
        if (!hasSample) throw new Error('missing sample/hidden test cases');
        if (bank.some((b) => normalize(b.title) === normalize(q.title))) {
          skipped.push(`${topic} → duplicate title "${q.title}"`);
          ok = true;
          break;
        }
        const created = await prisma.question.create({
          data: {
            title: q.title,
            statement: q.statement,
            difficulty,
            questionType: 'coding',
            tags: JSON.stringify([...new Set([...q.topics, ...q.requiredSkills, 'ai-generated', 'unverified'])]),
            settings: { aiGenerated: true, executionVerified: false, seedTopic: topic },
            testCases: { create: q.testCases },
            starterCodes: { create: starterCodesFrom(q) },
          },
        });
        await prisma.aIQuestionDraft.create({
          data: {
            authorId: admin.id,
            content: q,
            status: 'approved',
            approvedBy: admin.id,
            approvedAt: new Date(),
            questionId: created.id,
          },
        });
        added.push(`#${created.id} ${q.title} [${difficulty}]`);
        console.log(`✓ ${q.title}  (${topic.slice(0, 48)})`);
        ok = true;
      } catch (error: any) {
        const msg = error?.message || String(error);
        console.log(`✗ attempt ${attempt} for "${topic.slice(0, 48)}": ${msg.slice(0, 120)}`);
        if (/429|rate|quota/i.test(msg)) await sleep(65000);
        else await sleep(3000);
        if (attempt === 3) skipped.push(`${topic} → ${msg.slice(0, 80)}`);
      }
    }
    await sleep(2500);
  }
  console.log(`\nADDED ${added.length}`);
  added.forEach((a) => console.log(' -', a));
  console.log(`SKIPPED ${skipped.length}`);
  skipped.forEach((a) => console.log(' -', a));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
