import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

router.use(adminOnly);

router.get('/:id/export-md', async (req: Request, res: Response) => {
  try {
    const question = await prisma.question.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        starterCodes: true,
        testCases: true,
      },
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    let md = `# ${question.title}\n\n`;
    md += `**Difficulty:** ${question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}\n`;
    md += `**Tags:** ${JSON.parse(question.tags || '[]').join(', ')}\n`;
    md += `**CPU Time Limit (seconds):** ${question.timeLimit}\n`;
    md += `**Memory Limit (KB):** ${question.memoryLimit}\n\n`;
    
    md += `## Problem Statement\n\n${question.statement}\n\n`;

    const sampleTestCases = question.testCases.filter(tc => tc.isSample);
    const hiddenTestCases = question.testCases.filter(tc => !tc.isSample);

    if (sampleTestCases.length > 0) {
      md += `## Sample Test Cases\n\n`;
      sampleTestCases.forEach((tc, index) => {
        md += `### Sample ${index + 1}\n`;
        md += `**Input:**\n\`\`\`\n${tc.input}\n\`\`\`\n\n`;
        md += `**Output:**\n\`\`\`\n${tc.expectedOutput}\n\`\`\`\n\n`;
      });
    }

    if (hiddenTestCases.length > 0) {
      md += `## Hidden Test Cases\n\n`;
      hiddenTestCases.forEach((tc, index) => {
        md += `### Hidden ${index + 1}\n`;
        md += `**Input:**\n\`\`\`\n${tc.input}\n\`\`\`\n\n`;
        md += `**Output:**\n\`\`\`\n${tc.expectedOutput}\n\`\`\`\n\n`;
      });
    }

    if (question.starterCodes.length > 0) {
      md += `## Starter Code\n\n`;
      question.starterCodes.forEach((sc) => {
        md += `### ${sc.languageName}\n`;
        md += `\`\`\`${sc.languageName.toLowerCase()}\n${sc.code}\n\`\`\`\n\n`;
      });
    }

    const safeTitle = question.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.md"`);
    res.send(md);
  } catch (error) {
    console.error('Error exporting question:', error);
    res.status(500).json({ error: 'Failed to export question' });
  }
});

router.post('/import-md', async (req: Request, res: Response) => {
  try {
    const { markdownContent } = req.body;
    if (!markdownContent || typeof markdownContent !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid markdown content' });
    }

    const lines = markdownContent.split('\n');
    let title = '';
    const warnings: string[] = [];

    // Extract Title
    const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
    if (!titleMatch) {
      return res.status(400).json({ error: 'Missing required "# <Title>" section' });
    }
    title = titleMatch[1].trim();

    // Extract Metadata
    const diffMatch = markdownContent.match(/\*\*Difficulty:\*\*\s+(.+)$/m);
    const tagsMatch = markdownContent.match(/\*\*Tags:\*\*\s+(.+)$/m);
    const cpuMatch = markdownContent.match(/\*\*CPU Time Limit \(seconds\):\*\*\s+([\d.]+)/m);
    const memMatch = markdownContent.match(/\*\*Memory Limit \(KB\):\*\*\s+(\d+)/m);

    let difficulty = 'medium';
    if (diffMatch) {
      const d = diffMatch[1].trim().toLowerCase();
      if (['easy', 'medium', 'hard'].includes(d)) {
        difficulty = d;
      } else {
        warnings.push(`Invalid difficulty "${d}", defaulted to Medium`);
      }
    } else {
      warnings.push('Difficulty not specified, defaulted to Medium');
    }

    let tags: string[] = [];
    if (tagsMatch) {
      tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    } else {
      warnings.push('Tags not specified, defaulted to empty array');
    }

    let timeLimit = 2;
    if (cpuMatch) {
      timeLimit = parseFloat(cpuMatch[1]);
    } else {
      warnings.push('CPU Time Limit not specified, defaulted to 2');
    }

    let memoryLimit = 256000;
    if (memMatch) {
      memoryLimit = parseInt(memMatch[1], 10);
    } else {
      warnings.push('Memory Limit not specified, defaulted to 256000');
    }

    // Extract Problem Statement
    const statementMatch = markdownContent.match(/## Problem Statement\s+([\s\S]+?)(?=\n##\s|$)/);
    if (!statementMatch || !statementMatch[1].trim()) {
      return res.status(400).json({ error: 'Missing required "## Problem Statement" section or it is empty' });
    }
    const statement = statementMatch[1].trim();

    // Extract Test Cases
    const sample_testcases: any[] = [];
    const hidden_testcases: any[] = [];

    const extractTestCases = (sectionTitle: string, isSample: boolean, targetArray: any[]) => {
      const sectionRegex = new RegExp(`## ${sectionTitle}\\s+([\\s\\S]+?)(?=\\n##\\s|$)`);
      const sectionMatch = markdownContent.match(sectionRegex);
      if (sectionMatch) {
        const sectionContent = sectionMatch[1];
        const cases = sectionContent.split(/###\s+(?:Sample|Hidden)\s+\d+/).filter(c => c.trim());
        
        for (let i = 0; i < cases.length; i++) {
          const caseContent = cases[i];
          const inputMatch = caseContent.match(/\*\*Input:\*\*\s+```\w*\n([\s\S]*?)\n```/);
          const outputMatch = caseContent.match(/\*\*Output:\*\*\s+```\w*\n([\s\S]*?)\n```/);
          
          if (!inputMatch || !outputMatch) {
            return { error: `${isSample ? 'Sample' : 'Hidden'} ${i + 1} is missing an Input or Output block` };
          }
          
          targetArray.push({
            input: inputMatch[1],
            expectedOutput: outputMatch[1],
            isSample
          });
        }
      }
      return null;
    };

    const sampleErr = extractTestCases('Sample Test Cases', true, sample_testcases);
    if (sampleErr) return res.status(400).json({ error: sampleErr.error });
    
    const hiddenErr = extractTestCases('Hidden Test Cases', false, hidden_testcases);
    if (hiddenErr) return res.status(400).json({ error: hiddenErr.error });

    // Extract Starter Code
    const starter_code: any[] = [];
    const starterCodeMatch = markdownContent.match(/## Starter Code\s+([\s\S]+?)(?=\n##\s|$)/);
    if (starterCodeMatch) {
      const scSection = starterCodeMatch[1];
      const langs = scSection.split(/###\s+/).filter(c => c.trim());
      
      const langMapping: Record<string, { id: number, name: string }> = {
        'python': { id: 71, name: 'Python' },
        'c++': { id: 54, name: 'C++' },
        'java': { id: 62, name: 'Java' },
        'javascript': { id: 63, name: 'JavaScript' }
      };

      for (const langBlock of langs) {
        const firstLineBreak = langBlock.indexOf('\n');
        const langTitle = langBlock.substring(0, firstLineBreak).trim();
        const codeMatch = langBlock.match(/```\w*\n([\s\S]*?)\n```/);
        
        if (codeMatch) {
          const langId = langMapping[langTitle.toLowerCase()];
          if (langId) {
            starter_code.push({
              languageId: langId.id,
              languageName: langId.name,
              code: codeMatch[1].trim()
            });
          } else {
            warnings.push(`Unrecognized starter code language "${langTitle}" ignored`);
          }
        }
      }
    }

    res.json({
      title,
      statement,
      difficulty,
      tags,
      timeLimit,
      memoryLimit,
      sample_testcases,
      hidden_testcases,
      starter_code,
      warnings
    });
  } catch (error) {
    console.error('Error importing question:', error);
    res.status(500).json({ error: 'Failed to import question' });
  }
});

export default router;
