// Mock question bank used by seed.ts. Every question ships with a Python
// reference solution; `npm run db:verify-mock` runs them against the test cases.

export interface MockQuestion {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  timeLimit: number;
  statement: string;
  testCases: { input: string; expectedOutput: string; isSample: boolean }[];
  // Starter code per Judge0 language ID; generic starters are used when omitted
  starterCodes?: Record<number, string>;
  solution: string; // Python reference solution
}

export const LANGUAGE_NAMES: Record<number, string> = {
  71: 'Python',
  62: 'Java',
  54: 'C++',
  63: 'JavaScript',
};

export const GENERIC_STARTERS: Record<number, string> = {
  71: `import sys

def main():
    data = sys.stdin.read().split('\\n')
    # TODO: parse the input and print the answer
    pass

main()
`,
  63: `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');

// TODO: parse the input and print the answer
`,
  62: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // TODO: parse the input and print the answer
    }
}
`,
  54: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // TODO: parse the input and print the answer
    return 0;
}
`,
};

export const MOCK_QUESTIONS: MockQuestion[] = [
  {
    title: 'Two Sum',
    difficulty: 'easy',
    tags: ['array', 'hash-map'],
    timeLimit: 2,
    statement: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice. Print the two indices in increasing order.

**Input:** Line 1 — space-separated integers \`nums\`. Line 2 — integer \`target\`.
**Output:** The two indices separated by a space.

**Constraints:**
- 2 ≤ nums.length ≤ 10⁴
- -10⁹ ≤ nums[i], target ≤ 10⁹`,
    starterCodes: {
      71: `# Read input\nnums = list(map(int, input().split()))\ntarget = int(input())\n\n# Your solution here\ndef two_sum(nums, target):\n    pass\n\nresult = two_sum(nums, target)\nprint(result[0], result[1])`,
      62: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String[] parts = sc.nextLine().split(" ");\n        int[] nums = new int[parts.length];\n        for (int i = 0; i < parts.length; i++) nums[i] = Integer.parseInt(parts[i]);\n        int target = sc.nextInt();\n\n        int[] result = twoSum(nums, target);\n        System.out.println(result[0] + " " + result[1]);\n    }\n\n    static int[] twoSum(int[] nums, int target) {\n        return new int[]{0, 0};\n    }\n}`,
      54: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    string line;\n    getline(cin, line);\n    istringstream iss(line);\n    vector<int> nums;\n    int x;\n    while (iss >> x) nums.push_back(x);\n    int target;\n    cin >> target;\n\n    // TODO: your solution here\n    return 0;\n}`,
      63: `const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\nconst nums = lines[0].split(' ').map(Number);\nconst target = parseInt(lines[1]);\n\nfunction twoSum(nums, target) {\n    return [0, 0];\n}\n\nconst result = twoSum(nums, target);\nconsole.log(result[0] + ' ' + result[1]);`,
    },
    testCases: [
      { input: '2 7 11 15\n9', expectedOutput: '0 1', isSample: true },
      { input: '3 2 4\n6', expectedOutput: '1 2', isSample: true },
      { input: '3 3\n6', expectedOutput: '0 1', isSample: false },
      { input: '1 5 3 7 2\n9', expectedOutput: '3 4', isSample: false },
      { input: '-1 -2 -3 -4 -5\n-8', expectedOutput: '2 4', isSample: false },
    ],
    solution: `nums = list(map(int, input().split()))
target = int(input())
seen = {}
for i, x in enumerate(nums):
    if target - x in seen:
        print(seen[target - x], i)
        break
    seen[x] = i
`,
  },
  {
    title: 'Fizz Buzz',
    difficulty: 'easy',
    tags: ['math', 'string'],
    timeLimit: 2,
    statement: `Given an integer \`n\`, print the numbers from 1 to \`n\`, one per line, except:

- print \`FizzBuzz\` for multiples of both 3 and 5,
- print \`Fizz\` for multiples of 3,
- print \`Buzz\` for multiples of 5.

**Input:** A single integer n
**Output:** n lines

**Constraints:**
- 1 ≤ n ≤ 10⁴`,
    starterCodes: {
      71: `n = int(input())\n\n# Your solution here\nfor i in range(1, n + 1):\n    pass`,
      63: `const n = parseInt(require('fs').readFileSync(0, 'utf8').trim());\n\n// TODO: your solution here\nfor (let i = 1; i <= n; i++) {\n    console.log(i);\n}`,
    },
    testCases: [
      { input: '5', expectedOutput: '1\n2\nFizz\n4\nBuzz', isSample: true },
      { input: '15', expectedOutput: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz', isSample: false },
      { input: '1', expectedOutput: '1', isSample: false },
      { input: '3', expectedOutput: '1\n2\nFizz', isSample: false },
    ],
    solution: `n = int(input())
for i in range(1, n + 1):
    print('FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else i)
`,
  },
  {
    title: 'Reverse a String',
    difficulty: 'easy',
    tags: ['string', 'two-pointers'],
    timeLimit: 1,
    statement: `Reverse the given string.

**Input:** A single line containing the string s
**Output:** The reversed string

**Constraints:**
- 1 ≤ s.length ≤ 10⁵
- s consists of printable ASCII characters`,
    starterCodes: {
      71: `s = input()\n\n# TODO: your solution here\nprint(s)`,
    },
    testCases: [
      { input: 'hello', expectedOutput: 'olleh', isSample: true },
      { input: 'Hannah', expectedOutput: 'hannaH', isSample: true },
      { input: 'a', expectedOutput: 'a', isSample: false },
      { input: 'racecar', expectedOutput: 'racecar', isSample: false },
      { input: 'WissenCode', expectedOutput: 'edoC nessiW', isSample: false },
    ],
    solution: `print(input()[::-1])
`,
  },
  {
    title: 'Valid Parentheses',
    difficulty: 'easy',
    tags: ['stack', 'string'],
    timeLimit: 1,
    statement: `Given a string containing only the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`, decide whether it is valid.

A string is valid if every open bracket is closed by the same type of bracket, and brackets are closed in the correct order.

**Input:** A single line with the string s
**Output:** \`true\` or \`false\`

**Constraints:**
- 1 ≤ s.length ≤ 10⁴`,
    testCases: [
      { input: '()', expectedOutput: 'true', isSample: true },
      { input: '()[]{}', expectedOutput: 'true', isSample: true },
      { input: '(]', expectedOutput: 'false', isSample: true },
      { input: '([)]', expectedOutput: 'false', isSample: false },
      { input: '{[]}', expectedOutput: 'true', isSample: false },
      { input: '((', expectedOutput: 'false', isSample: false },
      { input: '){', expectedOutput: 'false', isSample: false },
    ],
    solution: `s = input().strip()
pairs = {')': '(', ']': '[', '}': '{'}
stack = []
ok = True
for ch in s:
    if ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
            ok = False
            break
    else:
        stack.append(ch)
print('true' if ok and not stack else 'false')
`,
  },
  {
    title: 'Maximum Subarray',
    difficulty: 'medium',
    tags: ['array', 'dynamic-programming'],
    timeLimit: 2,
    statement: `Given an integer array \`nums\`, find the contiguous subarray (containing at least one number) with the largest sum and print that sum.

**Input:** A single line of space-separated integers
**Output:** The maximum subarray sum

**Constraints:**
- 1 ≤ nums.length ≤ 10⁵
- -10⁴ ≤ nums[i] ≤ 10⁴`,
    testCases: [
      { input: '-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6', isSample: true },
      { input: '1', expectedOutput: '1', isSample: true },
      { input: '5 4 -1 7 8', expectedOutput: '23', isSample: false },
      { input: '-3 -1 -2', expectedOutput: '-1', isSample: false },
      { input: '2 -1 2 -1 2', expectedOutput: '4', isSample: false },
    ],
    solution: `nums = list(map(int, input().split()))
best = cur = nums[0]
for x in nums[1:]:
    cur = max(x, cur + x)
    best = max(best, cur)
print(best)
`,
  },
  {
    title: 'Climbing Stairs',
    difficulty: 'easy',
    tags: ['dynamic-programming', 'math'],
    timeLimit: 1,
    statement: `You are climbing a staircase with \`n\` steps. Each time you can climb either 1 or 2 steps. In how many distinct ways can you reach the top?

**Input:** A single integer n
**Output:** The number of distinct ways

**Constraints:**
- 1 ≤ n ≤ 45`,
    testCases: [
      { input: '2', expectedOutput: '2', isSample: true },
      { input: '3', expectedOutput: '3', isSample: true },
      { input: '1', expectedOutput: '1', isSample: false },
      { input: '5', expectedOutput: '8', isSample: false },
      { input: '10', expectedOutput: '89', isSample: false },
      { input: '45', expectedOutput: '1836311903', isSample: false },
    ],
    solution: `n = int(input())
a, b = 1, 1
for _ in range(n - 1):
    a, b = b, a + b
print(b)
`,
  },
  {
    title: 'Valid Palindrome',
    difficulty: 'easy',
    tags: ['string', 'two-pointers'],
    timeLimit: 1,
    statement: `A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing all non-alphanumeric characters, it reads the same forward and backward.

**Input:** A single line with the phrase s
**Output:** \`true\` or \`false\`

**Constraints:**
- 1 ≤ s.length ≤ 2 × 10⁵`,
    testCases: [
      { input: 'A man, a plan, a canal: Panama', expectedOutput: 'true', isSample: true },
      { input: 'race a car', expectedOutput: 'false', isSample: true },
      { input: 'No lemon, no melon', expectedOutput: 'true', isSample: false },
      { input: '0P', expectedOutput: 'false', isSample: false },
      { input: 'Was it a car or a cat I saw?', expectedOutput: 'true', isSample: false },
    ],
    solution: `s = ''.join(ch.lower() for ch in input() if ch.isalnum())
print('true' if s == s[::-1] else 'false')
`,
  },
  {
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    tags: ['string', 'sliding-window', 'hash-map'],
    timeLimit: 2,
    statement: `Given a string \`s\`, find the length of the longest substring without repeating characters.

**Input:** A single line with the string s (no spaces)
**Output:** The length of the longest such substring

**Constraints:**
- 1 ≤ s.length ≤ 5 × 10⁴`,
    testCases: [
      { input: 'abcabcbb', expectedOutput: '3', isSample: true },
      { input: 'bbbbb', expectedOutput: '1', isSample: true },
      { input: 'pwwkew', expectedOutput: '3', isSample: false },
      { input: 'dvdf', expectedOutput: '3', isSample: false },
      { input: 'abba', expectedOutput: '2', isSample: false },
      { input: 'abcdefghij', expectedOutput: '10', isSample: false },
    ],
    solution: `s = input().strip()
last = {}
start = best = 0
for i, ch in enumerate(s):
    if ch in last and last[ch] >= start:
        start = last[ch] + 1
    last[ch] = i
    best = max(best, i - start + 1)
print(best)
`,
  },
  {
    title: 'Number of Islands',
    difficulty: 'medium',
    tags: ['graph', 'bfs', 'matrix'],
    timeLimit: 2,
    statement: `Given an \`m × n\` grid of \`1\`s (land) and \`0\`s (water), count the number of islands. An island is formed by connecting adjacent land cells horizontally or vertically.

**Input:** Line 1 — two integers m and n. Next m lines — a string of n characters (\`0\` or \`1\`).
**Output:** The number of islands

**Constraints:**
- 1 ≤ m, n ≤ 300`,
    testCases: [
      { input: '4 5\n11110\n11010\n11000\n00000', expectedOutput: '1', isSample: true },
      { input: '4 5\n11000\n11000\n00100\n00011', expectedOutput: '3', isSample: true },
      { input: '1 1\n0', expectedOutput: '0', isSample: false },
      { input: '3 3\n101\n010\n101', expectedOutput: '5', isSample: false },
      { input: '3 4\n1111\n1001\n1111', expectedOutput: '1', isSample: false },
    ],
    solution: `import sys
from collections import deque
data = sys.stdin.read().split()
m, n = int(data[0]), int(data[1])
grid = [list(row) for row in data[2:2 + m]]
count = 0
for r in range(m):
    for c in range(n):
        if grid[r][c] == '1':
            count += 1
            grid[r][c] = '0'
            q = deque([(r, c)])
            while q:
                x, y = q.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < m and 0 <= ny < n and grid[nx][ny] == '1':
                        grid[nx][ny] = '0'
                        q.append((nx, ny))
print(count)
`,
  },
  {
    title: 'Merge Intervals',
    difficulty: 'medium',
    tags: ['array', 'sorting'],
    timeLimit: 2,
    statement: `Given a list of intervals, merge all overlapping intervals and print the result sorted by start.

**Input:** Line 1 — integer k. Next k lines — two integers \`start end\`.
**Output:** One merged interval per line, as \`start end\`

**Constraints:**
- 1 ≤ k ≤ 10⁴
- 0 ≤ start ≤ end ≤ 10⁴`,
    testCases: [
      { input: '4\n1 3\n2 6\n8 10\n15 18', expectedOutput: '1 6\n8 10\n15 18', isSample: true },
      { input: '2\n1 4\n4 5', expectedOutput: '1 5', isSample: true },
      { input: '1\n5 7', expectedOutput: '5 7', isSample: false },
      { input: '3\n1 4\n0 2\n3 5', expectedOutput: '0 5', isSample: false },
      { input: '3\n1 2\n3 4\n5 6', expectedOutput: '1 2\n3 4\n5 6', isSample: false },
    ],
    solution: `import sys
data = sys.stdin.read().split()
k = int(data[0])
iv = sorted((int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(k))
merged = []
for s, e in iv:
    if merged and s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
print('\\n'.join(f'{s} {e}' for s, e in merged))
`,
  },
  {
    title: 'Coin Change',
    difficulty: 'medium',
    tags: ['dynamic-programming'],
    timeLimit: 2,
    statement: `Given coin denominations and a target amount, print the fewest number of coins needed to make up that amount, or \`-1\` if it can't be done. You have an unlimited number of each coin.

**Input:** Line 1 — space-separated coin values. Line 2 — the amount.
**Output:** Minimum number of coins, or -1

**Constraints:**
- 1 ≤ coins.length ≤ 12
- 0 ≤ amount ≤ 10⁴`,
    testCases: [
      { input: '1 2 5\n11', expectedOutput: '3', isSample: true },
      { input: '2\n3', expectedOutput: '-1', isSample: true },
      { input: '1\n0', expectedOutput: '0', isSample: false },
      { input: '186 419 83 408\n6249', expectedOutput: '20', isSample: false },
      { input: '3 7\n14', expectedOutput: '2', isSample: false },
    ],
    solution: `coins = list(map(int, input().split()))
amount = int(input())
INF = float('inf')
dp = [0] + [INF] * amount
for a in range(1, amount + 1):
    for c in coins:
        if c <= a and dp[a - c] + 1 < dp[a]:
            dp[a] = dp[a - c] + 1
print(dp[amount] if dp[amount] != INF else -1)
`,
  },
  {
    title: 'Kth Largest Element',
    difficulty: 'medium',
    tags: ['heap', 'sorting', 'array'],
    timeLimit: 2,
    statement: `Given an integer array \`nums\` and an integer \`k\`, print the k-th largest element (in sorted order, not the k-th distinct element).

**Input:** Line 1 — space-separated integers. Line 2 — integer k.
**Output:** The k-th largest element

**Constraints:**
- 1 ≤ k ≤ nums.length ≤ 10⁵`,
    testCases: [
      { input: '3 2 1 5 6 4\n2', expectedOutput: '5', isSample: true },
      { input: '3 2 3 1 2 4 5 5 6\n4', expectedOutput: '4', isSample: true },
      { input: '1\n1', expectedOutput: '1', isSample: false },
      { input: '7 7 7 7\n3', expectedOutput: '7', isSample: false },
      { input: '-1 -5 3 0\n4', expectedOutput: '-5', isSample: false },
    ],
    solution: `import heapq
nums = list(map(int, input().split()))
k = int(input())
print(heapq.nlargest(k, nums)[-1])
`,
  },
  {
    title: 'Trapping Rain Water',
    difficulty: 'hard',
    tags: ['array', 'two-pointers', 'stack'],
    timeLimit: 2,
    statement: `Given \`n\` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.

**Input:** A single line of space-separated heights
**Output:** Total units of trapped water

**Constraints:**
- 1 ≤ n ≤ 2 × 10⁴
- 0 ≤ height[i] ≤ 10⁵`,
    testCases: [
      { input: '0 1 0 2 1 0 1 3 2 1 2 1', expectedOutput: '6', isSample: true },
      { input: '4 2 0 3 2 5', expectedOutput: '9', isSample: true },
      { input: '1 2 3', expectedOutput: '0', isSample: false },
      { input: '5 4 1 2', expectedOutput: '1', isSample: false },
      { input: '3 0 0 2 0 4', expectedOutput: '10', isSample: false },
    ],
    solution: `h = list(map(int, input().split()))
l, r = 0, len(h) - 1
lmax = rmax = water = 0
while l < r:
    if h[l] < h[r]:
        lmax = max(lmax, h[l])
        water += lmax - h[l]
        l += 1
    else:
        rmax = max(rmax, h[r])
        water += rmax - h[r]
        r -= 1
print(water)
`,
  },
];
