import { createWorkflow, createStep } from "@mastra/core/workflows";
import { RuntimeContext } from "@mastra/core/di";
import { z } from "zod";
import { Resend } from "resend";
import { Client } from "pg";

// 型定義をインポート
import {
  WorkflowInputSchema,
  IntermediateDataSchema,
  FinalOutputSchema,
  CharacterEvaluationSchema,
  WorkflowInputData,
  Character,
  CharacterRuntimeContext,
} from "./type";

import { characterEvaluatorAgent } from "../agents/characterEvaluatorAgent";

// ==============================================================================
// ワークフロー定義
// ==============================================================================

const createEpisodeWorkflow = createWorkflow({
  id: "create-episode-workflow",
  inputSchema: WorkflowInputSchema,
  outputSchema: FinalOutputSchema,
});

// ==============================================================================
// ステップ定義
// ==============================================================================

export const promptStep = createStep({
  id: "prompt-generator",
  description: "プロンプト生成",
  inputSchema: WorkflowInputSchema,
  outputSchema: IntermediateDataSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("summaryAgent");
    if (!agent) {
      throw new Error("サマリエージェントが見つかりません");
    }
    const workflowInput = { ...inputData } as WorkflowInputData;

    // 前回エピソード内容が存在する場合、要約を行う
    if (workflowInput.episode.previousEpisodeContent) {
      const response = await agent.generate(
        [
          {
            role: "user",
            content: `以下の前回エピソード内容を300〜500文字程度で要約してください。ストーリーの連続性を確保するため、重要な出来事、キャラクターの関係性の変化、決定的な瞬間などを含めてください：\n\n${workflowInput.episode.previousEpisodeContent}`,
          },
        ],
        {
          output: z.object({
            summary: z.string(),
          }),
        }
      );
      const summary = (await response.object).summary;
      workflowInput.episode.previousEpisodeContent = summary;
    }

    const structuredPrompt = createStructuredPrompt(workflowInput);
    return {
      userId: workflowInput.userId,
      episodeId: workflowInput.episode.id,
      content: structuredPrompt,
      characters: workflowInput.characters,
    };
  },
});

export const episodeGenerator = createStep({
  id: "episode-generator",
  description: "ユーザー入力と物語内容を元にエピソードを生成する",
  inputSchema: IntermediateDataSchema,
  outputSchema: IntermediateDataSchema,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("episodeGeneratorAgent");
    if (!agent) {
      throw new Error("プランニングエージェントが見つかりません");
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

    const storyData = response.object.content;

    return {
      userId: inputData.userId,
      episodeId: inputData.episodeId,
      content: storyData,
      characters: inputData.characters,
    };
  },
});

export const evaluateAndReviseStep = createStep({
  id: "evaluate-and-revise",
  description: "キャラクターによる評価と必要に応じた修正",
  inputSchema: IntermediateDataSchema,
  outputSchema: FinalOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const {
      userId,
      episodeId,
      content: episodeContent,
      characters,
    } = inputData;

    // 各キャラクターによる評価を並列で実行
    const evaluationPromises = characters.map(async (character) => {
      const result = await handleCharacterRequest(
        character.name,
        character.age,
        character.isProtagonist,
        character.description,
        episodeContent,
        character.gender,
        character.role,
        character.importance,
        character.episodeImportance,
        character.personality,
        character.appearance,
        character.motivation,
        character.backstory,
        character.relationships
      );
      return {
        characterName: character.name,
        ...result.response.object,
      };
    });

    // 全評価を待機
    const evaluations = await Promise.all(evaluationPromises);

    // いずれかの総合スコアが4未満かどうかを判定
    const lowScoreEvaluations = evaluations.filter(
      (evaluation) => evaluation.totalScore < 4
    );
    const needsRevision = lowScoreEvaluations.length > 0;

    // 最低スコアと平均スコアを計算（ログ用）
    const minScore = Math.min(...evaluations.map((e) => e.totalScore));
    const averageScore =
      evaluations.reduce((sum, evaluation) => sum + evaluation.totalScore, 0) /
      evaluations.length;

    let finalContent = episodeContent;

    // 低評価がある場合、修正を実行
    if (needsRevision) {
      // 低評価（スコア4未満）の提案を優先的に配置
      const prioritySuggestions = lowScoreEvaluations
        .filter((evaluation) => evaluation.improvements)
        .map(
          (evaluation) =>
            `【優先改善】${evaluation.characterName} (スコア: ${evaluation.totalScore}): ${evaluation.improvements}`
        );

      // その他のキャラクターからの提案も含める（スコアが4より大きいが4.5未満のキャラクター）
      const otherSuggestions = evaluations
        .filter(
          (evaluation) =>
            evaluation.totalScore > 4 &&
            evaluation.totalScore < 4.5 &&
            evaluation.improvements
        )
        .map(
          (evaluation) =>
            `【参考意見】${evaluation.characterName} (スコア: ${evaluation.totalScore}): ${evaluation.improvements}`
        );

      // 高評価のキャラクターからの良かった点も参考として含める
      const positiveHighlights = evaluations
        .filter((evaluation) => evaluation.totalScore >= 4.5)
        .map(
          (evaluation) =>
            `【良かった点】${evaluation.characterName} (スコア: ${evaluation.totalScore}): ${evaluation.highlights}`
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

### 維持すべき良い点
${positiveHighlights.join("\n")}

## 修正指示
特に低評価（スコア4未満）をつけたキャラクターの改善提案を優先的に反映しつつ、他のキャラクターの意見も参考にして修正してください。

修正時の注意点：
1. 低評価キャラクターが指摘した問題点を必ず解決する
2. 各キャラクターの個性や設定により忠実に
3. キャラクター間の関係性をより自然に
4. 高評価をつけたキャラクターの良いと感じた部分は維持する
5. 物語の流れを損なわないように注意しながら改善
6. キャラクターの「本当はこう言いたい/こうしたい」という意見も参考にする

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
      console.log(
        `🔄 エピソードが修正されました（最低スコア: ${minScore}, 平均スコア: ${averageScore.toFixed(
          1
        )}）`
      );
      console.log(
        `   低評価をつけたキャラクター: ${lowScoreEvaluations
          .map((e) => `${e.characterName}(${e.totalScore}点)`)
          .join(", ")}`
      );
    } else {
      console.log(
        `✅ 全キャラクターから高評価でした（最低スコア: ${minScore}, 平均スコア: ${averageScore.toFixed(
          1
        )}）`
      );
    }

    return {
      userId,
      episodeId,
      content: finalContent,
    };
  },
});

// ==============================================================================
// LINE送信ステップ
// ==============================================================================

const LineNotificationOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export const sendLineNotificationStep = createStep({
  id: "send-line-notification",
  description: "生成されたエピソードをLINEで送信またはメール送信",
  inputSchema: FinalOutputSchema,
  outputSchema: LineNotificationOutputSchema,
  execute: async ({ inputData }) => {
    const { userId, episodeId, content } = inputData;

    // 環境変数から設定を取得
    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
    const databaseUrl = process.env.DATABASE_URL;
    const resendApiKey = process.env.RESEND_API_KEY;
    const retryKey = crypto.randomUUID();

    if (!userId || !databaseUrl) {
      console.error("userIdまたはDATABASE_URLが設定されていません");
      return {
        success: false,
        error: "userIdまたはDATABASE_URLが設定されていません",
      };
    }

    // データベース接続
    const client = new Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();

      // まずepisodesテーブルのcontentカラムを更新
      const updateEpisodeQuery = `
        UPDATE "episodes" 
        SET "content" = $1, "updated_at" = NOW()
        WHERE "id" = $2
      `;
      await client.query(updateEpisodeQuery, [content, episodeId]);
      console.log(`✅ エピソード ${episodeId} のcontentを更新しました`);

      // ユーザーのLINEアカウント情報を取得
      const accountQuery = `
        SELECT "providerAccountId", "access_token" 
        FROM "account" 
        WHERE "userId" = $1 AND "provider" = 'line'
      `;
      const accountResult = await client.query(accountQuery, [userId]);

      if (accountResult.rows.length > 0 && channelAccessToken) {
        // LINEアカウントが存在する場合、LINE送信
        const lineUserId = accountResult.rows[0].providerAccountId;

        return await sendLineMessage(
          content,
          channelAccessToken,
          lineUserId,
          retryKey
        );
      } else {
        // LINEアカウントがない場合、ユーザーのメールアドレスを取得してメール送信
        const userQuery = `SELECT "email" FROM "user" WHERE "id" = $1`;
        const userResult = await client.query(userQuery, [userId]);

        if (userResult.rows.length === 0) {
          console.error("ユーザーが見つかりません");
          return {
            success: false,
            error: "ユーザーが見つかりません",
          };
        }

        const userEmail = userResult.rows[0].email;
        if (!userEmail) {
          console.error("ユーザーのメールアドレスが設定されていません");
          return {
            success: false,
            error: "ユーザーのメールアドレスが設定されていません",
          };
        }

        if (!resendApiKey) {
          console.error("RESEND_API_KEYが設定されていません");
          return {
            success: false,
            error: "RESEND_API_KEYが設定されていません",
          };
        }

        return await sendEmailNotification(content, userEmail, resendApiKey);
      }
    } catch (error) {
      console.error("データベース接続エラー:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "データベース接続エラー",
      };
    } finally {
      await client.end();
    }
  },
});

// LINE送信用のヘルパー関数
async function sendLineMessage(
  content: string,
  channelAccessToken: string,
  lineUserId: string,
  retryKey: string
) {
  // エピソードの冒頭部分を抽出（プレビュー用）
  const previewText = content.substring(0, 50) + "...";

  const messagePayload = {
    to: lineUserId,
    messages: [
      {
        type: "template",
        altText: "新しいエピソードが生成されました",
        template: {
          type: "buttons",
          thumbnailImageUrl:
            "https://placehold.jp/640x480.jpg?text=新エピソード",
          imageAspectRatio: "rectangle",
          imageSize: "cover",
          imageBackgroundColor: "#FFFFFF",
          title: "新しいエピソード",
          text: previewText,
          defaultAction: {
            type: "uri",
            label: "エピソードを読む",
            uri: "https://kimigatari.com/dashboard/story-generation",
          },
          actions: [
            {
              type: "uri",
              label: "全文を読む",
              uri: "https://kimigatari.com/dashboard/story-generation",
            },
          ],
        },
      },
    ],
  };

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
        "X-Line-Retry-Key": retryKey,
      },
      body: JSON.stringify(messagePayload),
    });

    if (response.ok) {
      const responseData = await response.json();
      console.log("✅ LINE通知が送信されました");
      return {
        success: true,
        messageId: responseData.messageId,
      };
    } else {
      const errorData = await response.text();
      console.error("LINE API エラー:", errorData);
      return {
        success: false,
        error: `LINE API エラー: ${response.status}`,
      };
    }
  } catch (error) {
    console.error("LINE送信エラー:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "不明なエラー",
    };
  }
}

// メール送信用のヘルパー関数
async function sendEmailNotification(
  content: string,
  userEmail: string,
  resendApiKey: string
) {
  const resend = new Resend(resendApiKey);

  // エピソードの冒頭部分を抽出（プレビュー用）
  const previewText = content.substring(0, 100) + "...";

  try {
    const data = await resend.emails.send({
      from: "キミガタリ Notify <notify@notify.kimigatari.com>",
      to: userEmail,
      subject: "新しいエピソードが生成されました",
      html: `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>キミガタリ - 新しいエピソード</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif; background-color: #f5f5f7;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f7;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
              <!-- ヘッダー -->
              <tr>
                <td style="padding: 48px 48px 32px 48px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0;">
                  <img src="https://kimigatari.com/icon.svg" alt="KimiGatari" style="width: 60px; height: 60px; margin-bottom: 16px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 0.5px;">キミガタリ</h1>
                  <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 16px; font-weight: 400;">あなたの物語を紡ぐ</p>
                </td>
              </tr>
              
              <!-- メインコンテンツ -->
              <tr>
                <td style="padding: 48px;">
                  <!-- アイコンとタイトル -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="display: inline-block; background-color: #f0f4ff; border-radius: 50%; padding: 20px; margin-bottom: 24px;">
                      <span style="font-size: 48px;">✨</span>
                    </div>
                    <h2 style="margin: 0; color: #1a202c; font-size: 28px; font-weight: 700;">
                      新しいエピソードが生成されました
                    </h2>
                  </div>
                  
                  <!-- プレビューセクション -->
                  <div style="background-color: #f8fafc; border-radius: 12px; padding: 28px; margin-bottom: 40px; border-left: 4px solid #667eea;">
                    <h3 style="margin: 0 0 16px 0; color: #4a5568; font-size: 18px; font-weight: 600;">
                      📖 エピソードのプレビュー
                    </h3>
                    <p style="margin: 0; color: #2d3748; font-size: 16px; line-height: 1.8;">
                      ${previewText}
                    </p>
                  </div>
                  
                  <!-- CTAボタン -->
                  <div style="text-align: center; margin: 40px 0;">
                    <a href="https://kimigatari.com/dashboard/story-generation" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 18px 56px; border-radius: 50px; font-size: 18px; font-weight: 600; box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;">
                      エピソード全文を読む →
                    </a>
                  </div>
                  
                  <!-- サブメッセージ -->
                  <div style="text-align: center; margin-top: 32px;">
                    <p style="margin: 0 0 8px 0; color: #718096; font-size: 16px; line-height: 1.6;">
                      ダッシュボードで新しいエピソードをお楽しみください
                    </p>
                    <p style="margin: 0; color: #a0aec0; font-size: 14px;">
                      物語の続きがあなたを待っています
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- フッター -->
              <tr>
                <td style="padding: 32px 48px; background-color: #f8fafc; border-radius: 0 0 16px 16px; text-align: center;">
                  <img src="https://kimigatari.com/icon.svg" alt="KimiGatari" style="width: 32px; height: 32px; margin-bottom: 16px; opacity: 0.6;">
                  <p style="margin: 0 0 8px 0; color: #a0aec0; font-size: 14px;">
                    このメールは KimiGatari から自動送信されています
                  </p>
                  <p style="margin: 0; color: #cbd5e0; font-size: 12px;">
                    © 2025 キミガタリ. All rights reserved.
                  </p>
                  <div style="margin-top: 16px;">
                    <a href="https://kimigatari.com" style="color: #667eea; text-decoration: none; font-size: 14px; margin: 0 8px;">ホーム</a>
                    <span style="color: #cbd5e0;">|</span>
                    <a href="https://kimigatari.com/dashboard" style="color: #667eea; text-decoration: none; font-size: 14px; margin: 0 8px;">ダッシュボード</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
      `,
    });

    console.log("✅ メール通知が送信されました");
    return {
      success: true,
      messageId: data.data?.id || "email-sent",
    };
  } catch (error) {
    console.error("メール送信エラー:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "メール送信エラー",
    };
  }
}

// ==============================================================================
// ヘルパー関数
// ==============================================================================

/**
 * オプショナルフィールドを条件付きで文字列に変換する関数
 */
function conditionalField(value: string | undefined, prefix: string): string {
  return value ? `${prefix}${value}` : "";
}

/**
 * エピソードタイプを日本語テキストに変換する関数
 */
function getEpisodeTypeText(continuityType: string): string {
  switch (continuityType) {
    case "sequential":
      return "前のエピソードの続きです。";
    case "independent":
      return "独立したエピソードです。";
    case "parallel":
      return "並行して進行するエピソードです。";
    default:
      return "";
  }
}

/**
 * キャラクター情報を文字列に変換する関数
 */
function formatCharacterInfo(char: Character): string {
  const mainInfo = `
### ${char.name}${char.isProtagonist ? "（主人公）" : ""}
- 年齢: ${char.age}
${conditionalField(char.gender, "- 性別: ")}
${conditionalField(char.role, "- 役割: ")}
- 説明: ${char.description}
${conditionalField(char.personality, "- 性格: ")}
${conditionalField(char.appearance, "- 外見: ")}
${conditionalField(char.motivation, "- 動機: ")}
${conditionalField(char.backstory, "- 背景: ")}
${conditionalField(char.speech_style, "- 話し方: ")}`;

  const actions =
    char.typical_actions && char.typical_actions.length > 0
      ? `- 典型的な行動:\n${char.typical_actions
          .map((action) => `  * ${action}`)
          .join("\n")}`
      : "";

  return `${mainInfo}
${actions}`;
}

/**
 * キャラクター間の関係を文字列に変換する関数
 */
function formatRelationships(characters: Character[]): string {
  const relationshipsText = characters
    .filter((char) => char.relationships && char.relationships.length > 0)
    .map((char) => {
      const relationshipDescriptions = char
        .relationships!.map(
          (rel) =>
            `- ${char.name}と${rel.targetCharacterName}は${
              rel.relationshipType
            }関係です${rel.description ? `（${rel.description}）` : ""}`
        )
        .join("\n");
      return relationshipDescriptions;
    })
    .join("\n");

  return relationshipsText
    ? `## キャラクター間の関係\n${relationshipsText}\n`
    : "";
}

/**
 * 構造化されたプロンプトを作成する関数
 */
function createStructuredPrompt(inputData: WorkflowInputData): string {
  const { story, episode, characters } = inputData;

  // 物語の基本情報セクション
  const storyBasicInfo = `
# エピソード生成指示

あなたは「${
    story.title
  }」という物語の創作を担当するプロのストーリーライターです。
この物語の第${episode.episodeNumber || "新"}話「${
    episode.title
  }」を執筆してください。

## 物語の背景
${story.background}

## 物語の概要
${story.summary}`;

  // エピソード情報セクション
  const episodeInfo = `
## このエピソードで最も重要なこと
${episode.additionalElements}

## エピソードタイプ
${getEpisodeTypeText(episode.continuityType)}`;

  // 前回エピソード内容セクション
  const previousEpisodeSection = episode.previousEpisodeContent
    ? `
## 前回のエピソード内容
${episode.previousEpisodeContent}
`
    : "";

  // キャラクター情報セクション
  const charactersSection = `
## 登場人物
${characters.map(formatCharacterInfo).join("\n")}`;

  // 関係性セクション
  const relationshipsSection = formatRelationships(characters);

  // 執筆ガイドラインセクション
  const guidelinesSection = `
## 執筆ガイドライン
1. **キャラクターの忠実性**: 各キャラクターの設定（性格、背景、話し方）に厳密に従ってください。キャラクターのセリフや行動はその人物の設定から逸脱しないようにしてください。
2. **物語構造**: 明確な導入、展開、クライマックス、結末を含めてください。
3. **対話**: 自然で個性的な会話を含め、各キャラクターの独自の話し方を反映させてください。
4. **描写**: 場面や感情を豊かに描写し、読者が物語を視覚化できるようにしてください。
5. **一貫性**: 前のエピソードがある場合は、その内容と一貫性を保ってください。
6. **テーマの強調**: このエピソードで特に重要な「${episode.additionalElements}」という要素を物語の中心に据えてください。

以上の情報と指示に基づいて、魅力的でキャラクターの個性が際立つエピソードを日本語で執筆してください。物語は約2000〜4000字で、読者が没頭できる豊かな内容にしてください。`;

  // 全セクションを結合
  return `${storyBasicInfo}${episodeInfo}${previousEpisodeSection}${charactersSection}

${relationshipsSection}${guidelinesSection}`;
}

/**
 * ダイナミックエージェントからレビューを作成する関数
 */
async function handleCharacterRequest(
  name: string,
  age: string,
  isProtagonist: boolean,
  description: string,
  content: string,
  gender?: string,
  role?: string,
  importance?: string,
  episodeImportance?: string,
  personality?: string,
  appearance?: string,
  motivation?: string,
  backstory?: string,
  relationships?: Array<{
    targetCharacterName: string;
    relationshipType: string;
    description?: string;
  }>
) {
  const runtimeContext = new RuntimeContext<CharacterRuntimeContext>();

  runtimeContext.set("name", name);
  runtimeContext.set("age", age);
  runtimeContext.set("isProtagonist", isProtagonist);
  runtimeContext.set("description", description);
  runtimeContext.set("gender", gender);
  runtimeContext.set("role", role);
  runtimeContext.set("importance", importance);
  runtimeContext.set("episodeImportance", episodeImportance);
  runtimeContext.set("personality", personality);
  runtimeContext.set("appearance", appearance);
  runtimeContext.set("motivation", motivation);
  runtimeContext.set("backstory", backstory);
  runtimeContext.set("relationships", relationships);

  const response = await characterEvaluatorAgent.generate(
    [
      {
        role: "user",
        content: content,
      },
    ],
    {
      output: CharacterEvaluationSchema,
      runtimeContext,
    }
  );

  return {
    response: response,
  };
}

// ==============================================================================
// ワークフローのチェーン化と確定
// ==============================================================================

createEpisodeWorkflow
  .then(promptStep)
  .then(episodeGenerator)
  .then(evaluateAndReviseStep)
  .then(sendLineNotificationStep)
  .commit();

export { createEpisodeWorkflow };
