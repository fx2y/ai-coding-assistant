# Model Preferences - User-Configurable Model Routing

This document describes the Model Preferences feature that implements RFC-MOD-001 (User-Configurable Model Routing) and RFC-MOD-002 (Heuristic Task-Complexity Hinting).

## Overview

The Model Preferences system allows users to configure which AI models should be used for different types of tasks within their projects. Instead of using hardcoded model selections, users can specify their preferred models for:

- **Embeddings**: Used for code search and similarity matching
- **General Chat**: Used for general conversations and simple queries  
- **Code Generation**: Used for generating and editing code
- **Re-ranking**: Used for improving search result relevance
- **Agent Reasoning**: Used for complex reasoning and planning

## Architecture

### Components

1. **Configuration Service** (`workers/src/services/configService.ts`)
   - Manages model preferences storage and retrieval
   - Provides task complexity hinting
   - Suggests appropriate models based on complexity tiers

2. **Configuration Handlers** (`workers/src/handlers/configHandlers.ts`)
   - REST API endpoints for managing preferences
   - Validation and error handling

3. **Model Preferences UI** (`client/src/components/ModelPreferences.tsx`)
   - React component for user configuration
   - Task complexity hints and model suggestions

4. **Integration Points**
   - Agent Service: Uses preferences for reasoning tasks
   - Indexing Service: Uses preferences for embedding generation
   - Other services: Can query preferences for their specific task types

### Data Storage

Model preferences are stored in Cloudflare KV with the key pattern:
```
project_config:{projectId}:model_prefs
```

The stored data structure:
```typescript
{
  embedding_config: { service: 'openai_embedding', modelName: 'text-embedding-ada-002' },
  chat_general_config: { service: 'openai_chat', modelName: 'gpt-3.5-turbo' },
  code_generation_config: { service: 'openai_chat', modelName: 'gpt-4' },
  re_ranking_config: { service: 'openai_chat', modelName: 'gpt-3.5-turbo' },
  agent_reasoning_config: { service: 'openai_chat', modelName: 'gpt-4' }
}
```

## API Endpoints

### Get Model Preferences
```http
GET /api/project/{projectId}/model_preferences
```

Returns the current model preferences for a project, or defaults if none are configured.

**Response:**
```json
{
  "success": true,
  "data": {
    "embedding_config": { "service": "openai_embedding", "modelName": "text-embedding-ada-002" },
    "chat_general_config": { "service": "openai_chat", "modelName": "gpt-3.5-turbo" },
    "code_generation_config": { "service": "openai_chat", "modelName": "gpt-4" },
    "re_ranking_config": { "service": "openai_chat", "modelName": "gpt-3.5-turbo" },
    "agent_reasoning_config": { "service": "openai_chat", "modelName": "gpt-4" }
  }
}
```

### Save Model Preferences
```http
POST /api/project/{projectId}/model_preferences
Content-Type: application/json

{
  "embedding_config": { "service": "jina_embedding", "modelName": "jina-embeddings-v2-base-en" },
  "chat_general_config": { "service": "anthropic_claude", "modelName": "claude-3-haiku-20240307" },
  "code_generation_config": { "service": "openai_chat", "modelName": "gpt-4-turbo" },
  "re_ranking_config": { "service": "openai_chat", "modelName": "gpt-3.5-turbo" },
  "agent_reasoning_config": { "service": "anthropic_claude", "modelName": "claude-3-opus-20240229" }
}
```

### Get Default Preferences
```http
GET /api/config/default_preferences
```

Returns the system default model preferences.

### Generate Task Complexity Hint
```http
POST /api/config/complexity_hint
Content-Type: application/json

{
  "taskType": "code_generation",
  "context": {
    "queryLength": 1000,
    "contextSize": 15000,
    "keywords": ["refactor", "architecture"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "taskType": "code_generation",
    "suggestedTier": "large_context_aware",
    "reasoning": "Complex code generation benefits from larger, more capable models"
  }
}
```

### Get Suggested Models
```http
GET /api/config/suggested_models/{service}/{tier}
```

Returns suggested model names for a service and complexity tier.

**Example:**
```http
GET /api/config/suggested_models/openai_chat/large_context_aware
```

**Response:**
```json
{
  "success": true,
  "data": {
    "models": ["gpt-4", "gpt-4-turbo", "gpt-4-32k"]
  }
}
```

## Supported Services

- `openai_chat`: OpenAI Chat Completions API
- `openai_embedding`: OpenAI Embeddings API
- `anthropic_claude`: Anthropic Claude API
- `jina_embedding`: Jina Embeddings API
- `cohere_generate`: Cohere Generate API
- `cohere_embed`: Cohere Embed API

## Task Complexity Tiers

### Small Fast (`small_fast`)
- Optimized for speed and cost efficiency
- Suitable for simple, straightforward tasks
- Examples: `gpt-3.5-turbo`, `claude-3-haiku-20240307`

### Large Context Aware (`large_context_aware`)
- Optimized for complex reasoning and large context windows
- Suitable for complex, nuanced tasks
- Examples: `gpt-4`, `claude-3-opus-20240229`

## Usage Examples

### Client-Side Integration

```typescript
import { ModelPreferences } from '../components/ModelPreferences';

function ProjectSettings({ projectId }: { projectId: string }) {
  const [showPreferences, setShowPreferences] = useState(false);

  return (
    <div>
      <button onClick={() => setShowPreferences(true)}>
        Configure Model Preferences
      </button>
      
      {showPreferences && (
        <ModelPreferences 
          projectId={projectId}
          onClose={() => setShowPreferences(false)}
        />
      )}
    </div>
  );
}
```

### Worker Service Integration

```typescript
import { getModelConfigForTask } from '../services/configService.js';

export async function performTask(env: Env, projectId: string, taskType: TaskType) {
  // Get user-configured model for this task type
  const modelConfig = await getModelConfigForTask(env, projectId, taskType);
  
  // Use the configured model
  const result = await callExternalAPI(
    modelConfig.service,
    modelConfig.modelName,
    // ... other parameters
  );
  
  return result;
}
```

## Default Model Configurations

The system provides sensible defaults for all task types:

- **Embeddings**: OpenAI `text-embedding-ada-002`
- **General Chat**: OpenAI `gpt-3.5-turbo`
- **Code Generation**: OpenAI `gpt-4`
- **Re-ranking**: OpenAI `gpt-3.5-turbo`
- **Agent Reasoning**: OpenAI `gpt-4`

## Task Complexity Hinting

The system can analyze task context and suggest appropriate complexity tiers:

### Complexity Indicators
- **Query Length**: Longer queries may benefit from larger models
- **Context Size**: Large context may require models with bigger context windows
- **Keywords**: Certain keywords indicate complexity (e.g., "refactor", "architecture")

### Heuristic Rules
- **Embeddings**: Always suggest `small_fast` (consistent requirements)
- **Code Generation**: `large_context_aware` for complex keywords/large context
- **Agent Reasoning**: `large_context_aware` for long queries/large context
- **Re-ranking**: Always suggest `small_fast` (speed-optimized)
- **General Chat**: Context-dependent based on keywords and query length

## Testing

The feature includes comprehensive test coverage:

- **Unit Tests**: `configService.test.ts`, `configHandlers.test.ts`
- **Integration Tests**: End-to-end workflow testing
- **Manual Testing**: UI component testing

### Test Strategy

1. **Configuration Storage**: Verify preferences are correctly saved and retrieved
2. **Model Selection**: Ensure services use configured models
3. **Fallback Behavior**: Test default model usage when no preferences exist
4. **Validation**: Verify input validation and error handling
5. **Complexity Hinting**: Test heuristic accuracy for different scenarios

## Migration and Backwards Compatibility

- Existing projects without configured preferences automatically use defaults
- Services gracefully fall back to defaults if preference retrieval fails
- API changes are backwards compatible with existing client code

## Performance Considerations

- Model preferences are cached within single Worker invocations
- KV reads are minimized through intelligent caching
- Default preferences are used immediately without KV lookup when no custom preferences exist

## Security

- Model preferences are scoped per project
- No sensitive data (API keys) is stored in preferences
- Input validation prevents injection attacks
- Rate limiting applies to all configuration endpoints 