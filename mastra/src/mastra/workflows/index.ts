import { RuntimeContext } from "@mastra/core/di";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { characterEvaluatorAgent } from "../agents/characterEvaluatorAgent";

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

// キャラクターエージェントのランタイムtype
type CharacterRuntimeContext = {
  characterName: string;
  characterDescription: string;
  characterRole: string;
};

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
    characters: z.array(characterSchema),
  }),
  execute: async ({ inputData }) => {
    const structuredPrompt = createSimplePrompt(
      inputData.content,
      inputData.characters
    );
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
  inputSchema: z.object({
    content: z.string(),
    characters: z.array(characterSchema),
  }),
  outputSchema: z.object({
    content: z.string(),
    characters: z.array(characterSchema),
  }),
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
      characters: inputData.characters,
    };
  },
});

// 評価と修正を行う動的ワークフローステップ
export const evaluateAndReviseStep = createStep({
  id: "evaluate-and-revise",
  description: "キャラクターによる評価と必要に応じた修正",
  inputSchema: z.object({
    content: z.string(),
    characters: z.array(characterSchema),
  }),
  outputSchema: z.object({
    content: z.string(),
    evaluations: z.array(
      z.object({
        characterName: z.string(),
        ...evaluationSchema.shape,
      })
    ),
    isRevised: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { content: episodeContent, characters } = inputData;

    // 各キャラクターによる評価を並列で実行
    const evaluationPromises = characters.map(async (character) => {
      const result = await handleCharacterRequest(
        character.name,
        character.description,
        character.role || "",
        `以下のエピソードを評価してください：\n\n${episodeContent}`
      );

      return {
        characterName: character.name,
        ...result.response.object,
      };
    });

    // 全評価を待機
    const evaluations = await Promise.all(evaluationPromises);

    // いずれかのスコアが3以下かどうかを判定
    const lowScoreEvaluations = evaluations.filter(
      (evaluation) => evaluation.score <= 3
    );
    const needsRevision = lowScoreEvaluations.length > 0;

    // 最低スコアと平均スコアを計算（ログ用）
    const minScore = Math.min(...evaluations.map((e) => e.score));
    const averageScore =
      evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) /
      evaluations.length;

    let finalContent = episodeContent;
    let isRevised = false;

    // 低評価がある場合、修正を実行
    if (needsRevision) {
      // 低評価（スコア3以下）の提案を優先的に配置
      const prioritySuggestions = lowScoreEvaluations
        .filter((evaluation) => evaluation.suggestions)
        .map(
          (evaluation) =>
            `【優先改善】${evaluation.characterName} (スコア: ${evaluation.score}): ${evaluation.suggestions}`
        );

      // その他のキャラクターからの提案も含める
      const otherSuggestions = evaluations
        .filter((evaluation) => evaluation.score > 3 && evaluation.suggestions)
        .map(
          (evaluation) =>
            `【参考意見】${evaluation.characterName} (スコア: ${evaluation.score}): ${evaluation.suggestions || evaluation.evaluation}`
        );

      const revisionPrompt = `
以下のエピソードを、キャラクターからの評価と提案に基づいて修正してください。

## 元のエピソード
${episodeContent}

## キャラクターからの評価

### 優先的に対応すべき改善点
${prioritySuggestions.join("\n")}

### その他の参考意見
${otherSuggestions.join("\n")}

## 修正指示
特に低評価（スコア3以下）をつけたキャラクターの改善提案を優先的に反映しつつ、他のキャラクターの意見も参考にして修正してください。

修正時の注意点：
1. 低評価キャラクターが指摘した問題点を必ず解決する
2. 各キャラクターの個性や設定により忠実に
3. キャラクター間の関係性をより自然に
4. 高評価をつけたキャラクターの良いと感じた部分は維持する
5. 物語の流れを損なわないように注意しながら改善

修正版のエピソードを出力してください。
`;

      const agent = mastra.getAgent("episodeGeneratorAgent");
      if (!agent) {
        throw new Error("エピソードジェネレーターエージェントが見つかりません");
      }

      const revisionResponse = await agent.generate(
        [
          {
            role: "user",
            content: revisionPrompt,
          },
        ],
        {
          output: z.object({
            content: z.string(),
          }),
        }
      );

      finalContent = revisionResponse.object.content;
      isRevised = true;

      // 修正後のエピソードを再評価（オプション）
      console.log(
        `🔄 エピソードが修正されました（最低スコア: ${minScore}, 平均スコア: ${averageScore.toFixed(1)}）`
      );
      console.log(
        `   低評価をつけたキャラクター: ${lowScoreEvaluations.map((e) => `${e.characterName}(${e.score}点)`).join(", ")}`
      );
    } else {
      console.log(
        `✅ 全キャラクターから高評価でした（最低スコア: ${minScore}, 平均スコア: ${averageScore.toFixed(1)}）`
      );
    }

    return {
      content: finalContent,
      evaluations: evaluations,
      isRevised: isRevised,
    };
  },
});

/**
 * シンプルなプロンプトを作成する関数
 */
function createSimplePrompt(
  content: string,
  characters: z.infer<typeof characterSchema>[]
): string {
  // キャラクター情報を整形
  const characterDescriptions = characters
    .map((char, index) => {
      const roleText = char.role ? `（${char.role}）` : "";
      return `${index + 1}. **${char.name}**${roleText}: ${char.description}`;
    })
    .join("\n");
  return `
# エピソード生成指示

あなたはプロのストーリーライターです。
以下の内容に基づいてエピソードを執筆してください。

## リクエスト内容
${content}

## 登場キャラクター
${characterDescriptions}

## 執筆ガイドライン
1. **物語構造**: 明確な導入、展開、クライマックス、結末を含めてください。
2. **対話**: 自然で個性的な会話を含めてください。
3. **描写**: 場面や感情を豊かに描写し、読者が物語を視覚化できるようにしてください。
4. **文章量**: 約1000〜2000字で、読者が没頭できる内容にしてください。

以上の指示に基づいて、魅力的なエピソードを日本語で執筆してください。`;
}

async function handleCharacterRequest(
  name: string,
  description: string,
  role: string,
  contenxt: string
) {
  const runtimeContext = new RuntimeContext<CharacterRuntimeContext>();

  runtimeContext.set("characterName", name);
  runtimeContext.set("characterDescription", description);
  runtimeContext.set("characterRole", role);

  const response = await characterEvaluatorAgent.generate(
    [
      {
        role: "user",
        content: contenxt,
      },
    ],
    {
      output: evaluationSchema,
      runtimeContext,
    }
  );

  return {
    response: response,
  };
}

// ワークフローを組み立て
simpleEpisodeWorkflow
  .then(promptStep)
  .then(episodeGenerator)
  .then(evaluateAndReviseStep)
  .commit();

export { simpleEpisodeWorkflow };
