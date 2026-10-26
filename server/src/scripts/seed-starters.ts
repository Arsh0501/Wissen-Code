import '../config/environment';
import { z } from 'zod';
import prisma from '../prisma';
import { structuredAI } from '../services/structured-ai';
import { STARTER_LANGUAGES } from '../services/workflow-schemas';

/**
 * Adds C++, Java and JavaScript starter code to every question that only has Python.
 *   npm run db:seed-starters          (uses the configured AI; falls back to generic templates)
 */
const GENERIC: Record<number, string> = {
  54: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Read the input described in the statement from stdin\n    // and print the answer to stdout.\n    return 0;\n}\n`,
  62: `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // Read the input described in the statement from stdin\n        // and print the answer to stdout.\n    }\n}\n`,
  63: `const input = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\n// Read the input described in the statement from \`input\`\n// and print the answer with console.log.\n`,
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const questions = await prisma.question.findMany({
    where: { questionType: { in: ['coding', 'debugging'] } },
    include: { starterCodes: true },
    orderBy: { id: 'asc' },
  });
  let aiDone = 0;
  let generic = 0;
  for (const q of questions) {
    const missing = STARTER_LANGUAGES.filter(
      (l) => l.languageId !== 71 && !q.starterCodes.some((s) => s.languageId === l.languageId),
    );
    if (!missing.length) continue;
    const python = q.starterCodes.find((s) => s.languageId === 71)?.code ?? '';
    let codes: Record<string, string> | null = null;
    if (process.env.OPENAI_API_KEY && process.env.STARTERS_AI !== '0') {
      for (let attempt = 1; attempt <= 2 && !codes; attempt++) {
        try {
          const out = await structuredAI(
            'starter_codes',
            z.object({ cpp: z.string(), java: z.string(), javascript: z.string() }),
            'Write minimal starter code for this coding question in C++17 (main reading stdin, printing stdout), Java (public class Main), and JavaScript (Node.js, read stdin via fs.readFileSync(0)). Mirror the structure of the Python starter: parse the described input, leave a clearly marked place for the solution, print the answer. No solution logic.',
            { title: q.title, statement: q.statement.slice(0, 2500), pythonStarter: python },
          );
          codes = { '54': out.cpp, '62': out.java, '63': out.javascript };
        } catch (error: any) {
          const msg = error?.message || String(error);
          console.log(`✗ #${q.id} attempt ${attempt}: ${msg.slice(0, 100)}`);
          if (/429|rate|quota/i.test(msg)) await sleep(65000);
        }
      }
    }
    await prisma.starterCode.createMany({
      data: missing.map((l) => ({
        questionId: q.id,
        languageId: l.languageId,
        languageName: l.languageName,
        code: codes?.[String(l.languageId)]?.trim() || GENERIC[l.languageId],
      })),
      skipDuplicates: true,
    });
    if (codes) aiDone++;
    else generic++;
    console.log(`${codes ? '✓' : '~'} #${q.id} ${q.title} → ${missing.map((m) => m.languageName).join(', ')}${codes ? '' : ' (generic template)'}`);
    await sleep(1500);
  }
  console.log(`\nDone: ${aiDone} with AI starters, ${generic} with generic templates.`);
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
