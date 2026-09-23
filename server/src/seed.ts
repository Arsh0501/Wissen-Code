import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clear existing data
  await prisma.testCaseResult.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assessmentQuestion.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.starterCode.deleteMany();
  await prisma.question.deleteMany();

  // ── Question 1: Two Sum ──
  const q1 = await prisma.question.create({
    data: {
      title: 'Two Sum',
      statement: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.

**Constraints:**
- 2 ≤ nums.length ≤ 10⁴
- -10⁹ ≤ nums[i] ≤ 10⁹
- -10⁹ ≤ target ≤ 10⁹
- Only one valid answer exists.`,
      difficulty: 'easy',
      tags: JSON.stringify(['array', 'hash-map']),
      timeLimit: 2,
      memoryLimit: 256000,
      starterCodes: {
        create: [
          {
            languageId: 71,
            languageName: 'Python',
            code: `# Read input\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Your solution here\ndef two_sum(nums, target):\n    pass\n\nresult = two_sum(nums, target)\nprint(result[0], result[1])`,
          },
          {
            languageId: 62,
            languageName: 'Java',
            code: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String[] parts = sc.nextLine().split(" ");\n        int[] nums = new int[parts.length];\n        for (int i = 0; i < parts.length; i++) nums[i] = Integer.parseInt(parts[i]);\n        int target = sc.nextInt();\n        \n        // Your solution here\n        int[] result = twoSum(nums, target);\n        System.out.println(result[0] + " " + result[1]);\n    }\n    \n    static int[] twoSum(int[] nums, int target) {\n        return new int[]{0, 0};\n    }\n}`,
          },
          {
            languageId: 54,
            languageName: 'C++',
            code: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    string line;\n    getline(cin, line);\n    istringstream iss(line);\n    vector<int> nums;\n    int x;\n    while (iss >> x) nums.push_back(x);\n    \n    int target;\n    cin >> target;\n    \n    // Your solution here\n    \n    return 0;\n}`,
          },
          {
            languageId: 63,
            languageName: 'JavaScript',
            code: `const readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\nconst lines = [];\n\nrl.on('line', (line) => lines.push(line.trim()));\nrl.on('close', () => {\n    const nums = lines[0].split(' ').map(Number);\n    const target = parseInt(lines[1]);\n    \n    // Your solution here\n    function twoSum(nums, target) {\n        return [0, 0];\n    }\n    \n    const result = twoSum(nums, target);\n    console.log(result[0] + ' ' + result[1]);\n});`,
          },
        ],
      },
      testCases: {
        create: [
          { input: '2 7 11 15\n9', expectedOutput: '0 1', isSample: true },
          { input: '3 2 4\n6', expectedOutput: '1 2', isSample: true },
          { input: '3 3\n6', expectedOutput: '0 1', isSample: false },
          { input: '1 5 3 7 2\n9', expectedOutput: '1 3', isSample: false },
          { input: '-1 -2 -3 -4 -5\n-8', expectedOutput: '2 4', isSample: false },
        ],
      },
    },
  });
  console.log(`✅ Created question: ${q1.title}`);

  // ── Question 2: Fizz Buzz ──
  const q2 = await prisma.question.create({
    data: {
      title: 'Fizz Buzz',
      statement: `Given an integer \`n\`, return a string array \`answer\` (1-indexed) where:

- \`answer[i] == "FizzBuzz"\` if \`i\` is divisible by 3 and 5.
- \`answer[i] == "Fizz"\` if \`i\` is divisible by 3.
- \`answer[i] == "Buzz"\` if \`i\` is divisible by 5.
- \`answer[i] == i\` (as a string) if none of the above conditions are true.

**Input:** A single integer n
**Output:** Print each answer on a new line

**Constraints:**
- 1 ≤ n ≤ 10⁴`,
      difficulty: 'easy',
      tags: JSON.stringify(['math', 'string']),
      timeLimit: 2,
      memoryLimit: 256000,
      starterCodes: {
        create: [
          {
            languageId: 71,
            languageName: 'Python',
            code: `n = int(input())\n\n# Your solution here\nfor i in range(1, n + 1):\n    pass`,
          },
          {
            languageId: 63,
            languageName: 'JavaScript',
            code: `const readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\n\nrl.on('line', (line) => {\n    const n = parseInt(line.trim());\n    // Your solution here\n    for (let i = 1; i <= n; i++) {\n        console.log(i);\n    }\n    rl.close();\n});`,
          },
        ],
      },
      testCases: {
        create: [
          { input: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz', isSample: true },
          { input: '15', expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz', isSample: false },
          { input: '1', expectedOutput: '1', isSample: false },
          { input: '3', expectedOutput: '1\n2\nFizz', isSample: false },
        ],
      },
    },
  });
  console.log(`✅ Created question: ${q2.title}`);

  // ── Question 3: Reverse String ──
  const q3 = await prisma.question.create({
    data: {
      title: 'Reverse a String',
      statement: `Write a function that reverses a string. The input string is given as a single line.

**Input:** A single string s
**Output:** The reversed string

**Constraints:**
- 1 ≤ s.length ≤ 10⁵
- s consists of printable ASCII characters`,
      difficulty: 'easy',
      tags: JSON.stringify(['string', 'two-pointers']),
      timeLimit: 1,
      memoryLimit: 256000,
      starterCodes: {
        create: [
          {
            languageId: 71,
            languageName: 'Python',
            code: `s = input()\n\n# Your solution here\nprint(s)`,
          },
        ],
      },
      testCases: {
        create: [
          { input: 'hello', expectedOutput: 'olleh', isSample: true },
          { input: 'Hannah', expectedOutput: 'hannaH', isSample: true },
          { input: 'a', expectedOutput: 'a', isSample: false },
          { input: 'racecar', expectedOutput: 'racecar', isSample: false },
        ],
      },
    },
  });
  console.log(`✅ Created question: ${q3.title}`);

  // ── Assessment ──
  const assessment = await prisma.assessment.create({
    data: {
      name: 'Assessment 2021',
      timeLimitMinutes: 60,
      questions: {
        create: [
          { questionId: q1.id, orderIndex: 0 },
          { questionId: q2.id, orderIndex: 1 },
          { questionId: q3.id, orderIndex: 2 },
        ],
      },
    },
  });
  console.log(`\n Created assessment: ${assessment.name} (${3} questions, ${assessment.timeLimitMinutes} min)\n`);

  console.log('Seed complete! You can now start the server and explore the platform.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
