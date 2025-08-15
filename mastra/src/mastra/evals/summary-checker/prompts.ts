export const SUMMARY_EVALUATION_INSTRUCTIONS = `あなたは物語創作の専門家として、続編執筆のための出来事記録サマリーの品質を評価します。このサマリーは「何がどうなったか」を明確に記録し、続きを書くための参照資料として使用されます。`;

export const generateSummaryEvaluationPrompt = ({
  output,
}: {
  output: string;
}) => `この続編創作用サマリーの品質を評価してください。

評価項目:
- 出来事の記録: 何が起きて、どう解決/未解決なのかが明確か
- 現在の状況: 物語が今どの地点にあり、各キャラが何をしているか明確か
- 未解決要素: 伏線、未回収の謎、継続中の問題が明記されているか
- 時系列の明確さ: いつ何が起きたか、出来事の順序が正確か
- 場所の記録: どこで何が起きたか、現在位置が明確か
- 関係性の変化: キャラクター間で起きた関係の変化が記録されているか
- 確定事項: 変更不可能な既定事実（死亡、破壊等）が明確か
- 次への繋がり: 直後に起きる予定や継続中の行動が明確か

※キャラクターの基本設定は別システムで管理されているため、ここでは評価しません

高品質な続編創作用サマリーの例:
"【第3章終了時点】
【起きた出来事】
- 太郎が魔王城への侵入を試み、第一関門突破
- 花子が太郎を庇って重傷、治癒魔法で一命を取り留める
- 魔王の側近ザークが太郎の正体に気づく

【現在状況】
- 太郎：魔王城第二層入口で休息中、体力7割
- 花子：意識回復したが戦闘不能、太郎への告白を決意
- ザーク：魔王への報告に向かっている途中

【未解決要素】
- 太郎の剣の封印解放条件が不明
- 花子の王女という正体は未だ隠されたまま
- ザークの報告が魔王に届くまで残り2時間

【確定事項】
- 第一関門の守護獣は死亡、復活不可
- 魔王城への正面ルートは封鎖された

【次の展開】
- 2時間以内に第三層到達が必要（ザークの報告前に）
- 花子が太郎に何か重要なことを伝えようとしている"

レスポンス: {
  "summaryScore": 9,
  "summaryAnalysis": {
    "eventRecord": "主要な出来事と結果が明確に記録されている",
    "currentSituation": "各キャラクターの現在位置と状態が明確",
    "unsolvedElements": "未解決の要素と緊急度が明記されている",
    "timelineClarity": "時系列と残り時間が正確に記録",
    "locationRecord": "魔王城第二層という場所が明確",
    "relationshipChanges": "花子の太郎への感情変化が記録",
    "establishedFacts": "変更不可能な事実が明確",
    "nextConnection": "直後の行動と時間制限が明確"
  },
  "improvementSuggestions": ["敵対勢力の動向をもう少し詳しく"]
}

低品質な続編創作用サマリーの例:
"太郎と花子が魔王城に行った。戦って勝った。"

レスポンス: {
  "summaryScore": 2,
  "summaryAnalysis": {
    "eventRecord": "何が起きたか具体的に不明",
    "currentSituation": "現在の状況が全く不明",
    "unsolvedElements": "未解決要素の記録なし",
    "timelineClarity": "いつ起きたか不明",
    "locationRecord": "どこで何が起きたか曖昧",
    "relationshipChanges": "関係性の変化が記録されていない",
    "establishedFacts": "確定事項が不明",
    "nextConnection": "次に何が起きるか不明"
  },
  "improvementSuggestions": [
    "具体的に何が起きたか記録",
    "現在各キャラがどこで何をしているか明記",
    "未解決の問題をリスト化",
    "時系列を明確に"
  ]
}

分析するサマリー:
${output}

以下の形式でレスポンスを返してください:
{
  "summaryScore": number (1-10の数値),
  "summaryAnalysis": {
    "eventRecord": "出来事の記録の評価",
    "currentSituation": "現在の状況の評価",
    "unsolvedElements": "未解決要素の評価",
    "timelineClarity": "時系列の明確さの評価",
    "locationRecord": "場所の記録の評価",
    "relationshipChanges": "関係性の変化の評価",
    "establishedFacts": "確定事項の評価",
    "nextConnection": "次への繋がりの評価"
  },
  "improvementSuggestions": ["改善提案1", "改善提案2", "改善提案3"]
}`;

export const generateSummaryReasonPrompt = ({
  summaryScore,
  summaryAnalysis,
  improvementSuggestions,
  missingElements = [],
}: {
  summaryScore: number;
  summaryAnalysis: {
    eventRecord: string;
    currentSituation: string;
    unsolvedElements: string;
    timelineClarity: string;
    locationRecord: string;
    relationshipChanges: string;
    establishedFacts: string;
    nextConnection: string;
  };
  improvementSuggestions: string[];
  missingElements?: string[];
}) => `このサマリーのスコアが${summaryScore}点である理由を説明してください。

評価結果:
- 出来事の記録: ${summaryAnalysis.eventRecord}
- 現在の状況: ${summaryAnalysis.currentSituation}
- 未解決要素: ${summaryAnalysis.unsolvedElements}
- 時系列の明確さ: ${summaryAnalysis.timelineClarity}
- 場所の記録: ${summaryAnalysis.locationRecord}
- 関係性の変化: ${summaryAnalysis.relationshipChanges}
- 確定事項: ${summaryAnalysis.establishedFacts}
- 次への繋がり: ${summaryAnalysis.nextConnection}

${
  missingElements && missingElements.length > 0
    ? `
不足している要素:
${missingElements.map((elem) => `• ${elem}`).join("\n")}
`
    : ""
}

改善提案:
${improvementSuggestions.map((sug) => `• ${sug}`).join("\n")}

以下の形式でレスポンスを返してください:
"このサマリーのスコアは${summaryScore}点です。理由: [詳細な説明]"`;
