# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

## Agent 呼び出し

```bash
POST ${MastraFunctionUrl}/api/agents/weatherAgent/generate
```

リクエストボディ
```json
{
"messages": "hello"
}
```

## ワークフロー呼び出し

1: ワークフローの実行を作成

```bash
POST ${MastraFunctionUrl}/api/workflows/weatherAgent/create-run
```

レスポンス
```json
{
  "runId": "xxx"
}
```
2: ワークフローを開始

```bash
GET ${MastraFunctionUrl}/api/workflows/weatherWorkflow/start?runId=${runId}
```

リクエストボディ
```json
{
    "inputData": {"city": "tokyo"}
}
```