import { z } from "zod";

// ==============================================================================
// 評価関連スキーマ（既存）
// ==============================================================================

/**
 * キャラクター評価のスコア型（1-5の整数）
 */
const EvaluationScoreSchema = z
  .number()
  .int()
  .min(1, "評価スコアは1以上である必要があります")
  .max(5, "評価スコアは5以下である必要があります");

/**
 * 評価の内訳
 */
const EvaluationBreakdownSchema = z.object({
  /** キャラクター表現の忠実度（1-5） */
  characterAccuracy: EvaluationScoreSchema,
  /** 動機と行動の一貫性（1-5） */
  motivationConsistency: EvaluationScoreSchema,
  /** 役割と重要度の適切性（1-5） */
  roleAppropriateness: EvaluationScoreSchema,
  /** 人間関係の描写（1-5） */
  relationshipDepiction: EvaluationScoreSchema,
  /** 感情表現と内面描写（1-5） */
  emotionalAuthenticity: EvaluationScoreSchema,
});

/**
 * キャラクター視点での評価結果スキーマ
 */
const CharacterEvaluationSchema = z
  .object({
    /** 総合評価点（各項目の平均、小数点第1位まで） */
    totalScore: z
      .number()
      .min(1, "総合評価は1以上である必要があります")
      .max(5, "総合評価は5以下である必要があります")
      .refine(
        (val) => Number(val.toFixed(1)) === val,
        "総合評価は小数点第1位までにしてください"
      ),
    /** 評価項目の内訳 */
    breakdown: EvaluationBreakdownSchema,
    /** キャラクターとしての率直な感想（100文字以内、性格を反映した口調で） */
    evaluation: z
      .string()
      .min(1, "評価コメントは必須です")
      .max(100, "評価コメントは100文字以内にしてください"),
    /** 特に良かった点（50文字以内） */
    highlights: z
      .string()
      .min(1, "良かった点は必須です")
      .max(50, "良かった点は50文字以内にしてください"),
    /** 改善してほしい点（totalScoreが3.5未満の場合必須、100文字以内） */
    improvements: z
      .string()
      .max(100, "改善点は100文字以内にしてください")
      .optional(),
    /** キャラクターなら本当はこう言いたい／こうしたい（50文字以内、性格を強く反映） */
    characterVoice: z
      .string()
      .min(1, "キャラクターボイスは必須です")
      .max(50, "キャラクターボイスは50文字以内にしてください"),
    /** キャラクターの重要度に対する扱いは適切だったか（30文字以内） */
    importanceAssessment: z
      .string()
      .min(1, "重要度評価は必須です")
      .max(30, "重要度評価は30文字以内にしてください"),
  })
  .refine(
    (data) => {
      // totalScoreが3.5未満の場合、improvementsは必須
      if (data.totalScore < 3.5) {
        return data.improvements !== undefined && data.improvements.length > 0;
      }
      return true;
    },
    {
      message: "総合評価が3.5未満の場合、改善点の記載は必須です",
      path: ["improvements"],
    }
  );

// ==============================================================================
// ワークフロー関連スキーマ（新規追加）
// ==============================================================================

/**
 * 関係性スキーマ
 */
export const RelationshipSchema = z.object({
  targetCharacterName: z.string(),
  relationshipType: z.string(),
  description: z.string().optional(),
});

/**
 * キャラクタースキーマ（共通定義）
 */
export const CharacterSchema = z.object({
  name: z.string(),
  age: z.string(),
  gender: z.string().optional(),
  role: z.string().optional(),
  importance: z.string().optional(),
  description: z.string(),
  isProtagonist: z.boolean().default(false),
  personality: z.string().optional(),
  appearance: z.string().optional(),
  motivation: z.string().optional(),
  backstory: z.string().optional(),
  relationships: z.array(RelationshipSchema).optional(),
  speech_style: z.string().optional(),
  typical_actions: z.array(z.string()).optional(),
});

/**
 * ストーリースキーマ
 */
export const StorySchema = z.object({
  title: z.string(),
  background: z.string(),
  summary: z.string(),
  genre: z.string().optional(),
  theme: z.string().optional(),
  worldSettings: z.string().optional(),
});

/**
 * エピソードスキーマ
 */
export const EpisodeSchema = z.object({
  title: z.string(),
  additionalElements: z.string(),
  continuityType: z.enum(["sequential", "independent", "parallel"]),
  previousEpisodeContent: z.string().optional(),
  episodeNumber: z.number().optional(),
});

/**
 * ワークフロー入力スキーマ
 */
export const WorkflowInputSchema = z.object({
  story: StorySchema,
  episode: EpisodeSchema,
  characters: z.array(CharacterSchema),
});

/**
 * 中間データスキーマ（content + characters）
 */
export const IntermediateDataSchema = z.object({
  content: z.string(),
  characters: z.array(CharacterSchema),
});

/**
 * 最終出力スキーマ（contentのみ）
 */
export const FinalOutputSchema = z.object({
  content: z.string(),
});

// ==============================================================================
// ランタイムコンテキスト型定義
// ==============================================================================

/**
 * キャラクターエージェントのランタイムコンテキスト型
 */
export type CharacterRuntimeContext = {
  name: string;
  age: string;
  gender?: string;
  role?: string;
  importance?: string;
  description: string;
  isProtagonist: boolean;
  personality?: string;
  appearance?: string;
  motivation?: string;
  backstory?: string;
  relationships?: Array<{
    targetCharacterName: string;
    relationshipType: string;
    description?: string;
  }>;
};

// ==============================================================================
// TypeScript型定義（Zodスキーマから自動生成）
// ==============================================================================

// 評価関連型（既存）
export type EvaluationScore = z.infer<typeof EvaluationScoreSchema>;
export type EvaluationBreakdown = z.infer<typeof EvaluationBreakdownSchema>;
export type CharacterEvaluation = z.infer<typeof CharacterEvaluationSchema>;

// ワークフロー関連型（新規）
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type StoryData = z.infer<typeof StorySchema>;
export type EpisodeData = z.infer<typeof EpisodeSchema>;
export type WorkflowInputData = z.infer<typeof WorkflowInputSchema>;
export type IntermediateData = z.infer<typeof IntermediateDataSchema>;
export type FinalOutput = z.infer<typeof FinalOutputSchema>;

// ==============================================================================
// スキーマエクスポート
// ==============================================================================

// 評価関連スキーマ（既存）
export {
  EvaluationScoreSchema,
  EvaluationBreakdownSchema,
  CharacterEvaluationSchema,
};

// ワークフロー関連スキーマ（新規）
// ※ 上記でexportされているものは再エクスポート不要
