# File Parsing & Text Chunking Implementation (P1-E1-S2)

This document describes the implementation of the file parsing and text chunking functionality for the AI Coding Assistant Workers.

## Overview

The chunking system implements RFC-IDX-001 by providing intelligent text chunking capabilities that:

- Parse common code file types (JavaScript, Python, Markdown, etc.)
- Split content into semantically meaningful chunks
- Store chunks in R2 with metadata in KV
- Support both generic and language-aware chunking strategies

## Architecture

### Core Components

1. **Language Detection** (`src/lib/languageDetection.ts`)
   - Detects programming languages from file extensions
   - Uses content patterns for validation
   - Supports 20+ programming languages and file types

2. **Text Chunking** (`src/lib/textChunker.ts`)
   - Generic text chunking based on lines and character count
   - Language-aware chunking that preserves semantic boundaries
   - Configurable chunk size, overlap, and line limits

3. **KV Store Utilities** (`src/lib/kvStore.ts`)
   - Typed helpers for chunk metadata operations
   - Key generation and management
   - Project-level chunk indexing

4. **Indexing Service** (`src/services/indexingService.ts`)
   - Main orchestration logic
   - File processing and chunk storage
   - Error handling and logging

## API Endpoints

### POST /api/project/:projectId/process_chunks

Processes all files in a project and creates chunks.

**Parameters:**
- `projectId` (URL parameter): UUID of the project to process

**Response:**
```json
{
  "chunkedFileCount": 5,
  "totalChunksCreated": 17,
  "errors": []
}
```

**Error Response:**
```json
{
  "error": "BadRequest",
  "message": "Invalid projectId format. Expected UUID.",
  "code": "INVALID_PROJECT_ID"
}
```

## Configuration

### Default Chunking Configuration

```typescript
{
  maxChunkSize: 1500,        // Maximum characters per chunk
  chunkOverlap: 200,         // Overlap characters between chunks
  maxLinesPerChunk: 75,      // Maximum lines per chunk
  preserveCodeBlocks: true   // Try to keep code blocks intact
}
```

### Supported Languages

- **JavaScript/TypeScript**: `.js`, `.mjs`, `.jsx`, `.ts`, `.tsx`
- **Python**: `.py`, `.pyw`, `.pyi`
- **Java**: `.java`
- **C/C++**: `.c`, `.h`, `.cpp`, `.cxx`, `.cc`, `.hpp`, `.hxx`
- **C#**: `.cs`
- **Go**: `.go`
- **Rust**: `.rs`
- **PHP**: `.php`, `.phtml`
- **Ruby**: `.rb`, `.rbw`
- **Web**: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`
- **Data**: `.json`, `.yaml`, `.yml`
- **Documentation**: `.md`, `.markdown`
- **Shell**: `.sh`, `.bash`, `.zsh`, `.fish`, `.ps1`
- **SQL**: `.sql`
- **Text**: `.txt`, `.log`, `.conf`, `.config`, `.ini`

## Chunking Strategies

### Generic Text Chunking

Used for files without specific language support:

- Splits by lines and character count
- Maintains configurable overlap between chunks
- Preserves line number information
- Handles edge cases (empty lines, very long lines)

### Language-Aware Chunking

Used for supported programming languages:

- **JavaScript/TypeScript**: Splits at function and class declarations
- **Python**: Splits at function and class definitions
- **Markdown**: Splits at header boundaries
- **Java/C#**: Splits at method and class declarations

## Data Storage

### R2 Storage Structure

```
projects/
├── {projectId}/
│   ├── original/
│   │   ├── src/example.js
│   │   ├── src/example.py
│   │   └── README.md
│   └── chunks/
│       ├── {chunkId1}.txt
│       ├── {chunkId2}.txt
│       └── {chunkId3}.txt
```

### KV Metadata Structure

#### Chunk Metadata
Key: `project:{projectId}:chunk:{chunkId}`

```json
{
  "id": "uuid-chunk-id",
  "projectId": "uuid-project-id",
  "originalFilePath": "src/example.js",
  "r2ChunkPath": "projects/{projectId}/chunks/{chunkId}.txt",
  "startLine": 1,
  "endLine": 25,
  "charCount": 500,
  "language": "javascript",
  "createdAt": "2025-05-30T21:00:00.000Z"
}
```

#### File Chunk Index
Key: `project:{projectId}:filechunks:{filePath}`

```json
["chunkId1", "chunkId2", "chunkId3"]
```

## Usage Examples

### 1. Upload and Process a Project

```bash
# Upload project
curl -X POST -F "codeZipFile=@project.zip" \
  https://your-worker.workers.dev/api/project/upload

# Response: {"project_id": "uuid", ...}

# Process chunks
curl -X POST \
  https://your-worker.workers.dev/api/project/{project_id}/process_chunks
```

### 2. Retrieve Chunk Metadata

```bash
# List all KV keys for a project
wrangler kv key list --namespace-id YOUR_KV_ID \
  --prefix "project:{projectId}:"

# Get specific chunk metadata
wrangler kv key get "project:{projectId}:chunk:{chunkId}" \
  --namespace-id YOUR_KV_ID
```

### 3. Access Chunk Content

```bash
# Get chunk content from R2
wrangler r2 object get ai-assistant-code-uploads \
  projects/{projectId}/chunks/{chunkId}.txt
```

## Testing

### Unit Tests

Run the test script to verify core functionality:

```bash
node test-chunking.js
```

### Integration Testing

1. **Upload Test Project:**
   ```bash
   cd test-data
   zip -r sample-project.zip sample-project/
   curl -X POST -F "codeZipFile=@sample-project.zip" \
     https://your-worker.workers.dev/api/project/upload
   ```

2. **Process Chunks:**
   ```bash
   curl -X POST \
     https://your-worker.workers.dev/api/project/{project_id}/process_chunks
   ```

3. **Verify Results:**
   - Check response indicates successful chunking
   - Verify chunks exist in R2
   - Verify metadata exists in KV

### Expected Test Results

For the sample project:
- **Files processed**: 5 (README.md, package.json, main.js, example.js, example.py)
- **Total chunks**: ~15-20 (depending on file sizes)
- **Languages detected**: JavaScript, Python, Markdown, JSON

## Error Handling

The system handles various error scenarios:

- **File not found in R2**: Logs error and continues processing
- **Invalid chunk content**: Validates and cleans chunks
- **KV storage failures**: Logs errors but doesn't stop processing
- **Language detection failures**: Falls back to generic chunking

## Performance Considerations

- **Memory usage**: Processes files one at a time to avoid memory issues
- **Chunk size limits**: Configurable to balance context and performance
- **Overlap optimization**: Calculated based on content to preserve context
- **Error isolation**: Individual file failures don't stop batch processing

## Future Enhancements

1. **Tree-sitter Integration**: Advanced language-aware parsing using WASM
2. **Custom Chunking Rules**: Per-language configuration options
3. **Incremental Updates**: Handle file changes and chunk updates
4. **Chunk Validation**: Content quality checks and optimization
5. **Performance Metrics**: Detailed timing and size analytics

## Troubleshooting

### Common Issues

1. **No chunks created**: Check if files were uploaded successfully
2. **KV keys not found**: Verify namespace ID and permissions
3. **Large file failures**: Check file size limits and memory usage
4. **Language detection issues**: Verify file extensions and content patterns

### Debug Commands

```bash
# Check worker logs
wrangler tail --format=pretty

# List R2 objects
wrangler r2 object list ai-assistant-code-uploads

# List KV keys
wrangler kv key list --namespace-id YOUR_KV_ID

# Get specific chunk
wrangler kv key get "project:PROJECT_ID:chunk:CHUNK_ID" \
  --namespace-id YOUR_KV_ID
```

## Implementation Status

✅ **Completed Features:**
- Language detection for 20+ file types
- Generic and language-aware chunking
- R2 chunk storage with metadata
- KV metadata storage and indexing
- REST API endpoints
- Error handling and logging
- Comprehensive testing

🔄 **Future Work:**
- Tree-sitter WASM integration
- Advanced semantic chunking
- Performance optimizations
- Incremental indexing support 