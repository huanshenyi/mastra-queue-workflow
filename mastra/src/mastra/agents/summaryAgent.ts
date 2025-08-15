import { Agent } from "@mastra/core/agent";
import { initializeBedrockClient } from "../../lib/bedrock-provider";
import { summaryEvaluationScorer } from "../evals/summary-checker";

const model = initializeBedrockClient();

// 今までのストーリー要約するエージェント
export const summaryAgent = new Agent({
  name: "summaryAgent",
  model: model("us.amazon.nova-lite-v1:0"),
  instructions: `あなたはストーリーを要約する専門家です。以下の指示に従って、読者が物語の魅力を感じられる要約を作成してください：

# 必須記載事項

## 1. 現在地点の明記
- 第何章/何話の終了時点か
- 物語内の日付や経過時間

## 2. キャラクター情報（主要人物全員）
- 現在の状態（健康、精神状態、能力レベル）
- 新しく獲得した所持品・装備
- 現在地
- 新しく獲得した能力や知識
- 他キャラとの関係性の現状

## 3. 未解決要素
- 未回収の伏線（箇条書き）
- 継続中の問題・課題
- キャラクターが知らない重要情報
- 読者だけが知っている情報

## 4. 世界観・設定
- 新しく確立されたルール（魔法、技術、社会システム）
- 地理的情報
- 組織や勢力の状況

## 5. 確定した展開
- 変更不可能な過去の出来事
- 死亡したキャラクター
- 破壊された場所やアイテム

## 6. 次章への申し送り
- 直近で起きる予定のイベント
- キャラクターの目的と行動予定
- 時限的な要素（期限のあるイベント等）

# 形式
構造化された箇条書きまたはセクション分けで記載し、続編執筆時に素早く参照できるようにする。`,
  // scorers: {
  //   summaryChecker: {
  //     scorer: summaryEvaluationScorer,
  //     sampling: {
  //       type: "ratio",
  //       rate: 0.1,
  //     },
  //   },
  // },
});
