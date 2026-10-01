import prisma from '../../prisma';

// Define the tool schemas for OpenAI function calling
export const questionTools = [
  {
    type: "function",
    function: {
      name: "searchQuestionBank",
      description: "Search the existing question bank for similar questions to avoid duplicates or get inspiration.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query (e.g., 'React hooks', 'Binary search tree')" },
          difficulty: { type: "string", description: "Optional difficulty level to filter by" }
        },
        required: ["query"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "checkDuplicate",
      description: "Check if a newly generated question already exists in the database to prevent duplicates.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The title of the generated question" },
          statement: { type: "string", description: "The core problem statement" }
        },
        required: ["title", "statement"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "validateQuestion",
      description: "Validate the generated question format, ensuring it has all required fields (title, statement, constraints).",
      parameters: {
        type: "object",
        properties: {
          questionObj: { 
            type: "object", 
            description: "The full question object to validate" 
          }
        },
        required: ["questionObj"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "generateTestCases",
      description: "Generate mock test cases for a coding question based on the problem statement.",
      parameters: {
        type: "object",
        properties: {
          statement: { type: "string", description: "The problem statement to generate test cases for" },
          count: { type: "number", description: "Number of test cases to generate" }
        },
        required: ["statement", "count"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "saveDraftQuestion",
      description: "Save the generated question as a draft in the database.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          statement: { type: "string" },
          difficulty: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          testCases: { 
            type: "array", 
            items: { 
              type: "object",
              properties: {
                input: { type: "string" },
                expectedOutput: { type: "string" }
              }
            } 
          }
        },
        required: ["title", "statement", "difficulty", "tags", "testCases"],
      },
    }
  }
] as const;

// Implementation of the tools
export const toolImplementations = {
  searchQuestionBank: async (args: { query: string; difficulty?: string }) => {
    console.log(`[Tool] Searching question bank for: ${args.query}`);
    const questions = await prisma.question.findMany({
      where: {
        title: { contains: args.query, mode: 'insensitive' },
        ...(args.difficulty && { difficulty: args.difficulty })
      },
      take: 5
    });
    return JSON.stringify(questions.map(q => ({ title: q.title, difficulty: q.difficulty })));
  },
  
  checkDuplicate: async (args: { title: string; statement: string }) => {
    console.log(`[Tool] Checking duplicates for: ${args.title}`);
    const existing = await prisma.question.findFirst({
      where: { title: { equals: args.title, mode: 'insensitive' } }
    });
    return JSON.stringify({ isDuplicate: !!existing });
  },
  
  validateQuestion: async (args: { questionObj: any }) => {
    console.log(`[Tool] Validating question...`);
    const isValid = !!args.questionObj.title && !!args.questionObj.statement;
    return JSON.stringify({ valid: isValid, errors: isValid ? [] : ["Missing title or statement"] });
  },
  
  generateTestCases: async (args: { statement: string; count: number }) => {
    console.log(`[Tool] Generating ${args.count} test cases...`);
    // Mocking test cases. In a real-world scenario, you might do another LLM call here.
    const cases = Array.from({ length: args.count }).map((_, i) => ({
      input: `sample_input_${i+1}`,
      expectedOutput: `sample_output_${i+1}`
    }));
    return JSON.stringify({ testCases: cases });
  },
  
  saveDraftQuestion: async (args: { title: string; statement: string; difficulty: string; tags: string[]; testCases: any[] }) => {
    console.log(`[Tool] Saving draft question: ${args.title}`);
    try {
      const q = await prisma.question.create({
        data: {
          title: args.title,
          statement: args.statement,
          difficulty: args.difficulty,
          tags: JSON.stringify(args.tags),
          testCases: {
            create: args.testCases.map(tc => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: true
            }))
          }
        }
      });
      return JSON.stringify({ success: true, questionId: q.id });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e.message });
    }
  }
};
