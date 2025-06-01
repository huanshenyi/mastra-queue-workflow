import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Mastra, Step, Workflow } from "@mastra/core";
import { z } from "zod";

const isMastra = (mastra: any): mastra is Mastra => {
  return mastra && typeof mastra === "object" && mastra instanceof Mastra;
};

// キャラクタースキーマ
const characterSchema = z.object({
  name: z.string().describe("キャラクター名"),
  description: z.string().describe("キャラクターの説明"),
  role: z.string().optional().describe("役割（主人公、悪役など）"),
});

// 評価スキーマ
const evaluationSchema = z.object({
  score: z.number().min(1).max(5),
  evaluation: z.string(),
  suggestions: z.string().optional(),
});

// メインワークフロー
const simpleEpisodeWorkflow = createWorkflow({
  id: "simple-episode-workflow",
  inputSchema: z.object({
    content: z.string(),
    characters: z.array(characterSchema).describe("キャラクター情報のリスト"),
  }),
  outputSchema: z.object({
    content: z.string(),
    evaluations: z
      .array(
        z.object({
          characterName: z.string(),
          ...evaluationSchema.shape,
        })
      )
      .optional(),
    isRevised: z.boolean().optional(),
  }),
});

// プロンプト生成ステップ
export const promptStep = createStep({
  id: "prompt-generator",
  description: "シンプルなプロンプト生成",
  inputSchema: simpleEpisodeWorkflow.inputSchema,
  outputSchema: z.object({
    content: z.string(),
  }),
  execute: async ({ inputData }) => {
    // 入力内容から簡単な構造化プロンプトを作成
    const structuredPrompt = createSimplePrompt(inputData.content);
    return {
      content: structuredPrompt,
      characters: inputData.characters,
    };
  },
});

// エピソード生成ステップ
export const episodeGenerator = createStep({
  id: "episode-generator",
  description: "エピソードを生成する",
  inputSchema: simpleEpisodeWorkflow.inputSchema,
  outputSchema: simpleEpisodeWorkflow.outputSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("episodeGeneratorAgent");
    if (!agent) {
      throw new Error("エピソードジェネレーターエージェントが見つかりません");
    }

    const response = await agent.generate(
      [
        {
          role: "user",
          content: inputData.content,
        },
      ],
      {
        output: z.object({
          content: z.string(),
        }),
      }
    );

    return {
      content: response.object.content,
    };
  },
});

/**
 * シンプルなプロンプトを作成する関数
 */
function createSimplePrompt(content: string): string {
  return `
# エピソード生成指示

あなたはプロのストーリーライターです。
以下の内容に基づいてエピソードを執筆してください。

## リクエスト内容
${content}

## 執筆ガイドライン
1. **物語構造**: 明確な導入、展開、クライマックス、結末を含めてください。
2. **対話**: 自然で個性的な会話を含めてください。
3. **描写**: 場面や感情を豊かに描写し、読者が物語を視覚化できるようにしてください。
4. **文章量**: 約1000〜2000字で、読者が没頭できる内容にしてください。

以上の指示に基づいて、魅力的なエピソードを日本語で執筆してください。`;
}

// ワークフローを組み立て
simpleEpisodeWorkflow.then(promptStep).then(episodeGenerator).commit();

export { simpleEpisodeWorkflow };
