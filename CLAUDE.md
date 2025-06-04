# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Mastra-based AI workflow system** for generating and evaluating story episodes using multiple AI agents. The system combines AWS CDK infrastructure with a sophisticated multi-agent architecture that includes episode generation, character-driven evaluation, and automated revision capabilities.

## Architecture

### Core Components

- **AWS CDK Infrastructure** (`lib/iac-stack.ts`): Lambda deployment with streaming support
- **Mastra Application** (`mastra/src/`): AI workflow orchestration framework
- **Multi-Agent System**: Specialized AI agents for different tasks
- **Workflow Pipeline**: 5-step episode generation and evaluation process

### Key Agents

- **Episode Generator** (`episodeGeneratorAgent.ts`): Creates story episodes using Claude 3.7 Sonnet
- **Character Evaluator** (`characterEvaluatorAgent.ts`): Each character becomes an AI evaluator
- **Summary Agent** (`summaryAgent.ts`): Provides episode summaries
- **Weather Agent** (`tools/index.ts`): Fetches weather data for context

### Workflow Architecture

The main workflow (`mastra/src/mastra/workflows/index.ts`) implements a sophisticated pipeline:
1. Episode generation with character context
2. Parallel character-based evaluation (each character scores independently)
3. Automatic revision if average score < 4.0
4. Summary generation
5. LINE notification with user interaction

## Development Commands

### Infrastructure (Root Level)
```bash
npm run build          # Compile TypeScript
npm run deploy         # Deploy AWS stack
npx cdk diff          # Compare deployed vs current state
npm test              # Run Jest tests
```

### Mastra Application
```bash
cd mastra
npm run dev           # Start development server
npm run build         # Build Mastra application
npm install           # Install dependencies
```

## Key Technical Details

### Type Safety
- Comprehensive Zod schemas for runtime validation
- TypeScript throughout with strict typing
- Input/output validation for all agents and workflows

### AI Configuration
- All agents use Claude 3.7 Sonnet via AWS Bedrock
- Streaming responses supported via Lambda Web Adapter
- Langfuse integration for observability

### Character Evaluation System
Characters are dynamically converted to AI evaluators, each providing perspective-based feedback with personality-driven responses. This creates a unique multi-perspective evaluation system.

### Revision Logic
Episodes scoring below 4.0 average are automatically revised using character feedback, with up to one revision attempt per workflow execution.

## Environment Setup

Required environment variables (see `mastra/env.example`):
- `AWS_REGION`
- `LANGFUSE_*` variables for observability
- `LINE_*` variables for notifications

## Deployment

The system deploys as a Docker container to AWS Lambda with:
- Streaming response capability
- LINE webhook integration
- Bedrock AI model access
- Queue-based workflow processing