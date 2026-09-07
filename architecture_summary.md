# MeeraAI Codebase Architecture Analysis

## System Architecture Overview
MeeraAI is a modular, high-performance personal AI assistant built to combine local runtime capabilities, speech processing, tool execution, and cloud LLM integration into a unified orchestrator.

## Subsystem Breakdown

### 1. Core Orchestrator
- **Role**: Manages application state, session context, event loops, and routing between user inputs and model providers.
- **Key Responsibilities**: Intent handling, prompt management, context preservation, and tool execution security.

### 2. Voice & Audio Perception Layer
- **Role**: Process audio input for wake-word detection, speech-to-text (STT) conversion, and text-to-speech (TTS) output synthesis.
- **Key Features**: Low-latency audio streaming, local voice model support, and audio buffer management.

### 3. Model Provider & Inference Engine
- **Role**: Dual-layer execution supporting local models (via Ollama/Llama.cpp) and cloud APIs (OpenAI, Anthropic, Google).
- **Key Features**: Fallback mechanisms, streaming response handling, token tracking, and structured output parsing.

### 4. Tool Execution & Memory Layer
- **Role**: Provides agents with memory retrieval (vector/KV databases) and secure sandbox execution (shell execution, filesystem interaction, and API calls).
- **Key Features**: Guardrails against arbitrary command execution, persistent workspace history, and environment isolation.