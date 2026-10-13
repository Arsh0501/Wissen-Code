// Judge0 languages supported across the app. `id` is the Judge0 language id.
export const LANGUAGES = [
  { id: 71, name: 'Python', monacoLang: 'python', defaultCode: '# Write your solution here\n\ndef solve():\n    pass\n\nsolve()' },
  { id: 62, name: 'Java', monacoLang: 'java', defaultCode: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}' },
  { id: 54, name: 'C++', monacoLang: 'cpp', defaultCode: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}' },
  { id: 63, name: 'JavaScript', monacoLang: 'javascript', defaultCode: '// Write your solution here\nconst readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin });\n\nrl.on("line", (line) => {\n    console.log(line);\n});' },
];

export const DEFAULT_LANGUAGE_ID = 71;

export const LANGUAGE_NAMES: Record<number, string> = Object.fromEntries(LANGUAGES.map((l) => [l.id, l.name]));

// The interview editor lists the most common interview languages first
export const INTERVIEW_LANGUAGES = [71, 63, 62, 54].map((id) => LANGUAGES.find((l) => l.id === id)!);
