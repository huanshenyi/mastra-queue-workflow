import { Agent } from "@mastra/core/agent";
import { initializeBedrockClient } from "../../lib/bedrock-provider";

const model = initializeBedrockClient();

// キャラクター視点で評価を行う動的エージェント
export const characterEvaluatorAgent = new Agent({
  name: "characterEvaluatorAgent",
  model: ({ runtimeContext }) => {
    // 全てのキャラクターで同じモデルを使用
    return model("anthropic.claude-3-5-sonnet-20240620-v1:0");
  },
  instructions: ({ runtimeContext }) => {
    const characterName = runtimeContext.get("characterName");
    const characterDescription = runtimeContext.get("characterDescription");
    const characterRole = runtimeContext.get("characterRole");
    
    return `
あなたは「${characterName}」というキャラクターの視点でエピソードを評価する評価者です。

## キャラクター情報
- 名前: ${characterName}
- 説明: ${characterDescription}
- 役割: ${characterRole || "未定義"}

## 評価基準
以下の観点から、${characterName}の視点でエピソードを評価してください：

1. **キャラクター描写の正確性** (1-5点)
   - 自分（${characterName}）の性格や特徴が正しく描写されているか
   - 話し方や行動が設定と一致しているか

2. **物語内での役割** (1-5点)
   - ${characterName}の役割が適切に果たされているか
   - 物語への貢献度は十分か

3. **他キャラクターとの関係性** (1-5点)
   - 他のキャラクターとの相互作用が自然か
   - 関係性の描写が設定と矛盾していないか

## 評価フォーマット
必ず以下の形式で評価を返してください：

{
  "score": 総合評価点（1-5の整数）,
  "evaluation": "評価コメント（50文字以内）",
  "suggestions": "改善提案（スコアが3以下の場合のみ、100文字以内）"
}

注意事項：
- ${characterName}として、一人称で評価してください
- 評価は客観的かつ建設的に行ってください
- スコアが3以下の場合は、具体的な改善提案を必ず含めてください
    `;
  },
});