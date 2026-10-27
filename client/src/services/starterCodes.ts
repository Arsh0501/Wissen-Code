import { Question } from '../types';

export function getAvailableQuestionLanguages(
  question: Pick<Question, 'questionType' | 'starterCodes'> | null | undefined,
) {
  if (question?.questionType === 'sql') return [{ id: 82, name: 'SQL (SQLite)' }];
  const languages = [
    { id: 71, name: 'Python' },
    { id: 63, name: 'JavaScript' },
    { id: 62, name: 'Java' },
    { id: 54, name: 'C++' },
  ];
  const prepared = languages.filter((language) =>
    question?.starterCodes?.some(
      (starter) => starter.languageId === language.id && starter.code.trim(),
    ),
  );
  return prepared.length ? prepared : languages;
}

export const DEFAULT_STARTER_CODES: Record<number, string> = {
  71: `# Python 3
import sys

def solve():
    # Read all input from standard input
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    # TODO: Implement your solution here
    pass

if __name__ == '__main__':
    solve()
`,
  63: `// JavaScript (Node.js)
const fs = require('fs');

function solve() {
    const input = fs.readFileSync(0, 'utf-8').trim().split('\\n');
    // TODO: Implement your solution here
}

solve();
`,
  62: `// Java
import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        // TODO: Implement your solution here
    }
}
`,
  54: `// C++
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // TODO: Implement your solution here
    return 0;
}
`,
  82: `-- SQL (SQLite)
-- Write your SQL query below
SELECT * FROM table_name;
`,
};

export function getStarterCodeForLanguage(
  question: Question | any | null | undefined,
  languageId: number,
): string {
  if (!question) return DEFAULT_STARTER_CODES[languageId] || '';

  // 1. Check starterCodes array on the question
  if (Array.isArray(question.starterCodes) && question.starterCodes.length > 0) {
    const match = question.starterCodes.find(
      (sc: any) => Number(sc.languageId) === Number(languageId),
    );
    if (match && typeof match.code === 'string' && match.code.trim()) {
      return match.code;
    }
  }

  // 2. If Python (71) and question has starterCodePython
  if (Number(languageId) === 71 && question.starterCodePython?.trim()) {
    return question.starterCodePython;
  }

  // 3. Fallback to generic template
  return DEFAULT_STARTER_CODES[languageId] || '';
}
