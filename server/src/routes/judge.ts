import { Router, Request, Response } from 'express';
import { executeCode, LANGUAGE_MAP } from '../services/judge0';

const router = Router();

// POST /api/judge/run — Run code against custom input (for "Run code" button)
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { sourceCode, languageId, stdin } = req.body;

    if (!sourceCode || !languageId) {
      return res.status(400).json({ error: 'sourceCode and languageId are required' });
    }

    const result = await executeCode({
      sourceCode,
      languageId,
      stdin: stdin || '',
      cpuTimeLimit: 5,
      memoryLimit: 256000,
    });

    // Format a clean response for the frontend
    const output = {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      compileOutput: result.compile_output || '',
      message: result.message || '',
      statusId: result.status.id,
      statusDescription: result.status.description,
      executionTime: result.time,
      memoryUsed: result.memory,
      isError:
        result.status.id !== 3, // 3 = Accepted (successful execution)
    };

    res.json(output);
  } catch (error: any) {
    console.error('Judge0 execution error:', error.message);
    res.status(500).json({
      error: error.message,
      isError: true,
      stdout: '',
      stderr: error.message,
      compileOutput: '',
      statusDescription: 'Internal Error',
    });
  }
});

// GET /api/judge/languages — Get supported languages
router.get('/languages', (_req: Request, res: Response) => {
  const languages = Object.entries(LANGUAGE_MAP).map(([key, value]) => ({
    key,
    id: value.id,
    name: value.name,
    monacoLang: value.monacoLang,
  }));
  res.json(languages);
});

export default router;
