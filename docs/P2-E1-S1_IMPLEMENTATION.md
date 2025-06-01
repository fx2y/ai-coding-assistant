# P2-E1-S1 Implementation: Client & Worker Explicit Context (@file, Pinned Items)

## Overview

This implementation provides explicit context management for the AI Coding Assistant, allowing users to reference specific files and folders using `@file` and `@folder` tags in their queries. The system also integrates pinned context items to provide comprehensive context for LLM interactions.

## Features Implemented

### 1. Client-Side @tag Parsing
- **Location**: `client/src/services/searchApiService.ts`
- **Function**: `parseExplicitTags(queryText: string)`
- **Capabilities**:
  - Parses `@filename.js` and `@folder/` tags from user queries
  - Supports complex paths with dots, dashes, and nested directories
  - Removes duplicate paths automatically
  - Returns cleaned query text with tags removed

### 2. Context Builder Service
- **Location**: `workers/src/services/contextBuilderService.ts`
- **Main Function**: `buildPromptContext(env, projectId, options)`
- **Capabilities**:
  - Fetches content for explicitly tagged files from R2
  - Handles folder paths by listing and fetching multiple files
  - Integrates pinned context items (both file paths and text snippets)
  - Includes vector search results in context
  - Provides comprehensive error handling and logging

### 3. Enhanced Search API
- **Location**: `workers/src/handlers/searchHandlers.ts`
- **Enhancement**: Updated `handleVectorQuery` to support explicit context
- **Features**:
  - Automatically parses @tags from queries when no explicit paths provided
  - Builds comprehensive context including files, folders, and pinned items
  - Returns context information alongside search results

### 4. Client-Side Context-Aware Search
- **Location**: `client/src/services/searchApiService.ts`
- **Function**: `performContextAwareVectorSearch(request)`
- **Features**:
  - Automatically parses @tags from queries
  - Merges parsed tags with existing explicit context paths
  - Supports pinned item IDs and inclusion flags

## Usage Examples

### Basic @tag Usage
```typescript
// User query with @tags
const query = "How does authentication work in @auth.js? Check @utils/security.js for helpers.";

// Parsed result
const { explicitPaths, cleanedQuery } = parseExplicitTags(query);
// explicitPaths: ['auth.js', 'utils/security.js']
// cleanedQuery: "How does authentication work in ? Check  for helpers."
```

### Folder References
```typescript
// User query with folder tag
const query = "Analyze the structure of @src/components/ folder";

// System will list all files in src/components/ and include their content
```

### Complete Context Building
```typescript
const contextResult = await buildPromptContext(env, projectId, {
  explicitPaths: ['auth.js', 'utils/security.js'],
  includePinned: true,
  vectorSearchResults: searchResults
});

// Result includes:
// - Content of auth.js and utils/security.js
// - All pinned text snippets and file paths
// - Vector search results formatted for LLM
```

## API Schema Updates

### VectorSearchRequestSchema
Extended to include:
```typescript
{
  // ... existing fields
  explicit_context_paths: z.array(z.string()).optional().default([]),
  pinned_item_ids: z.array(z.string()).optional().default([]),
  include_pinned: z.boolean().optional().default(true)
}
```

### New ContextAwareQuerySchema
For future agent endpoints:
```typescript
{
  project_id: string,
  query_text: string,
  user_api_keys: { llmKey: string, embeddingKey?: string },
  explicit_context_paths?: string[],
  pinned_item_ids?: string[],
  include_pinned?: boolean,
  vector_search_config?: { ... }
}
```

## Context String Format

The system generates structured context strings for LLM consumption:

```
--- PINNED SNIPPET: Security Note ---
Remember: Always validate JWT tokens on server side
---

--- FILE: auth.js ---
export function authenticate(req, res, next) {
  const token = req.headers.authorization;
  // ... file content
}
---

--- RETRIEVED CODE SNIPPET (middleware/auth.js L15, Score: 0.92) ---
function validateToken(token) {
  return jwt.verify(token, secret);
}
---
```

## Error Handling

### Graceful Degradation
- Missing files are noted in context: `[File not found: filename.js]`
- Large files show size warnings: `[File too large: filename.js (100KB, max 50KB)]`
- Folder listing errors are captured and logged
- Context building errors return minimal error context instead of failing

### Operational Excellence
- Comprehensive logging with request IDs
- Source tracking for debugging (`includedSources` array)
- Character count monitoring for token management
- Configurable limits (max folder files, max file size)

## Testing

### Unit Tests
- **Context Builder**: `workers/src/services/contextBuilderService.test.ts`
  - Tests @tag parsing edge cases
  - Tests file/folder content fetching
  - Tests pinned items integration
  - Tests error handling scenarios

- **Client Search API**: `client/src/services/searchApiService.test.ts`
  - Tests client-side @tag parsing
  - Tests context-aware search functionality
  - Tests API error handling

### Integration Tests
- **Complete Workflow**: `workers/src/services/contextBuilderService.integration.test.ts`
  - Demonstrates end-to-end @tag + pinned items + vector results workflow
  - Tests folder handling with pinned items
  - Verifies R2 and KV integration

## Performance Considerations

### Optimizations
- Deduplication of file paths
- Configurable limits to prevent excessive context
- Parallel file fetching (when possible)
- Efficient R2 key construction

### Limits
- Default max folder files: 10
- Default max file size: 50KB
- Automatic truncation warnings for large folders

## Future Enhancements

### Ready for Integration
- Token counting and truncation (RFC-CTX-003)
- Agent tool integration for code generation
- Context caching for frequently accessed files
- Smart context prioritization based on relevance scores

### Extensibility
- Support for `@symbol:functionName` references
- Context templates for common patterns
- User-defined context shortcuts
- Cross-project context references

## Verification

The implementation satisfies all P2-E1-S1 requirements:

✅ **Client parses @file tags**: `parseExplicitTags()` function extracts file/folder paths  
✅ **Worker fetches content**: `buildPromptContext()` retrieves content from R2  
✅ **Pinned items included**: Integrates both file paths and text snippets from KV  
✅ **Prioritized in context**: Explicit content appears before vector search results  
✅ **Interface verified**: `explicit_paths` and `pinned_item_ids` sent to worker  
✅ **Test strategy implemented**: Comprehensive unit and integration tests  

The system is ready for agent integration and provides a solid foundation for advanced context management features. 