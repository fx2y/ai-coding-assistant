# ReAct Agent Service

This document describes the ReAct Agent implementation for the AI Coding Assistant, implementing RFC-AGT-001 and RFC-AGT-004.

## Overview

The ReAct Agent uses a Reason-Act approach where the LLM:
1. **Reasons** about the user's request (generates a "Thought")
2. **Acts** by either using a tool or providing a direct response

## Architecture

### Core Components

- **`agentService.ts`** - Core ReAct loop logic
- **`agentHandlers.ts`** - API endpoint handlers
- **`/api/agent/react_step`** - Main endpoint for ReAct steps

### Data Flow

```
Client Request → Validation → Context Building → LLM Call → Response Parsing → Client Response
```

## API Usage

### Endpoint: `POST /api/agent/react_step`

#### Request Format

```json
{
  "project_id": "uuid",
  "session_id": "uuid", 
  "user_query": "How do I implement authentication?",
  "conversation_history": [],
  "explicit_context_paths": ["src/auth.js"],
  "pinned_item_ids_to_include": ["pinned-id-1"],
  "implicit_context": {
    "last_focused_file_path": "src/components/Login.tsx"
  },
  "vector_search_results_to_include": [],
  "available_tools_prompt_segment": "You have access to: code_search(query), read_file(path)",
  "llm_config": {
    "modelName": "gpt-4",
    "tokenLimit": 8192,
    "reservedOutputTokens": 1000,
    "temperature": 0.2
  },
  "user_api_keys": {
    "llmKey": "user-llm-api-key"
  },
  "max_iterations_left": 3
}
```

#### Response Format

```json
{
  "session_id": "uuid",
  "thought": "I need to search for authentication code to understand the implementation.",
  "action_details": {
    "tool_name": "code_search",
    "tool_args": { "query": "authentication login" },
    "raw_action_string": "Action: code_search(query=\"authentication login\")"
  },
  "direct_response": null,
  "updated_conversation_history": [
    {
      "role": "user",
      "content": "How do I implement authentication?",
      "timestamp": "2024-01-01T00:00:00.000Z"
    },
    {
      "role": "assistant", 
      "content": "I need to search for authentication code to understand the implementation.",
      "toolCall": {
        "name": "code_search",
        "parameters": { "query": "authentication login" }
      },
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ],
  "iterations_remaining": 2,
  "status": "action_proposed"
}
```

## ReAct Workflow

### 1. Action Proposed

When the agent proposes an action:
- `status`: `"action_proposed"`
- `action_details`: Contains tool name and arguments
- `direct_response`: `null`

The client should:
1. Execute the proposed tool
2. Send the results back as a tool observation

### 2. Direct Response

When the agent provides a direct answer:
- `status`: `"direct_response_provided"`
- `action_details`: `null`
- `direct_response`: Contains the answer

### 3. Error Handling

When an error occurs:
- `status`: `"error"`
- Both `action_details` and `direct_response` are `null`

## Example Workflow

### Step 1: User Query
```json
{
  "user_query": "How is authentication implemented?",
  "conversation_history": []
}
```

### Step 2: Agent Proposes Action
```json
{
  "status": "action_proposed",
  "thought": "I need to search for authentication code.",
  "action_details": {
    "tool_name": "code_search",
    "tool_args": { "query": "authentication" }
  }
}
```

### Step 3: Client Executes Tool & Sends Observation
```json
{
  "user_query": "",
  "conversation_history": [
    // ... previous turns
    {
      "role": "tool_observation",
      "content": "Found: auth.js with login() function, middleware/auth.js",
      "toolResult": {
        "success": true,
        "result": "Search results..."
      }
    }
  ]
}
```

### Step 4: Agent Provides Final Answer
```json
{
  "status": "direct_response_provided",
  "thought": "Based on the search results, I can explain the authentication.",
  "direct_response": "Authentication is implemented using auth.js..."
}
```

## Context Integration

The ReAct agent integrates with the context management system (RFC-CTX-001, RFC-CTX-002, RFC-CTX-003):

- **Explicit Context**: Files/folders tagged with `@file` or `@folder`
- **Pinned Context**: User-pinned code snippets and files
- **Implicit Context**: Last focused file in the editor
- **Vector Search**: Relevant code chunks from semantic search
- **Conversation History**: Previous turns in the conversation

## Tool Integration

Tools are defined via the `available_tools_prompt_segment` parameter. Example:

```
You have access to the following tools:
- code_search(query="search terms") - Search for code matching the query
- read_file(path="file/path") - Read the contents of a specific file
- write_file(path="file/path", content="new content") - Write content to a file

Format: Action: tool_name(param="value")
```

## Error Handling

The service handles various error scenarios:
- Invalid request format (400 Bad Request)
- LLM API failures (returns error status)
- Context building failures (fallback to minimal context)
- Tool parsing failures (falls back to direct response)

## Testing

- **Unit Tests**: `agentService.test.ts` - Tests core logic with mocked dependencies
- **Integration Tests**: `agentHandlers.test.ts` - Tests API endpoints and workflows

## Configuration

Key configuration options:
- **Model Selection**: Supports OpenAI GPT and Anthropic Claude models
- **Token Limits**: Configurable context window and output token limits
- **Temperature**: Controls LLM creativity/randomness
- **Iteration Limits**: Prevents infinite loops in multi-step reasoning

## Security

- **BYOK (Bring Your Own Key)**: User API keys are passed per-request
- **Input Validation**: All requests validated with Zod schemas
- **Error Sanitization**: Sensitive information filtered from error responses 