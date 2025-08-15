import { createScorer } from "@mastra/core/scores";
import { z } from "zod";
import {
  generateSummaryEvaluationPrompt,
  generateSummaryReasonPrompt,
  SUMMARY_EVALUATION_INSTRUCTIONS,
} from "./prompts";
import { initializeBedrockClient } from "../../../lib/bedrock-provider";

const model = initializeBedrockClient();

export const summaryEvaluationScorer = createScorer({
  name: "続編創作用サマリー評価",
  description: "続編執筆のための出来事記録サマリーの品質を評価",
  judge: {
    model: model("us.anthropic.claude-3-5-haiku-20241022-v1:0"),
    instructions: SUMMARY_EVALUATION_INSTRUCTIONS,
  },
})
  .analyze({
    description: "続編創作用サマリーの品質を分析",
    outputSchema: z.object({
      summaryScore: z.number().min(1).max(10),
      summaryAnalysis: z.object({
        eventRecord: z.string(), // 出来事の記録
        currentSituation: z.string(), // 現在の状況
        unsolvedElements: z.string(), // 未解決要素
        timelineClarity: z.string(), // 時系列の明確さ
        locationRecord: z.string(), // 場所の記録
        relationshipChanges: z.string(), // 関係性の変化
        establishedFacts: z.string(), // 確定事項
        nextConnection: z.string(), // 次への繋がり
      }),
      improvementSuggestions: z.array(z.string()),
      missingElements: z.array(z.string()).optional(),
    }),
    createPrompt: ({ run }) => {
      const { output } = run;
      return generateSummaryEvaluationPrompt({ output: output[0].content });
    },
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult.summaryScore / 10;
  })
  .generateReason({
    description: "スコアの理由を生成",
    createPrompt: ({ results }) => {
      return generateSummaryReasonPrompt({
        summaryScore: results.analyzeStepResult.summaryScore,
        summaryAnalysis: results.analyzeStepResult.summaryAnalysis,
        improvementSuggestions:
          results.analyzeStepResult.improvementSuggestions,
        missingElements: results.analyzeStepResult.missingElements,
      });
    },
  });
