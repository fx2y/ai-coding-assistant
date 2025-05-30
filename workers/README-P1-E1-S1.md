# P1-E1-S1: Cloudflare Worker Code Upload & R2 Storage

This document describes the implementation of the code upload and R2 storage functionality for the AI Coding Assistant project.

## Overview

**Spec ID**: P1-E1-S1  
**Title**: Cloudflare Worker: Code Upload & R2 Storage  
**RFC Reference**: RFC-IDX-001  

This implementation provides a Cloudflare Worker endpoint that accepts ZIP files containing user code, extracts the files, and stores them in a Cloudflare R2 bucket with proper namespacing and metadata.

## Architecture

```
Client → Worker Endpoint → ZIP Processing → R2 Storage
                ↓
        Project ID Generation
                ↓
        File Filtering & Validation
                ↓
        Content Type Detection
```

## Implementation Details

### 1. Endpoint

**URL**: `POST /api/project/upload`  
**Content-Type**: `multipart/form-data`  
**Form Field**: `codeZipFile` (ZIP file)

### 2. Key Components

#### `workers/src/handlers/projectHandlers.ts`
- Handles the upload endpoint
- Validates file type and size (max 50MB)
- Generates unique project IDs
- Orchestrates the upload process

#### `workers/src/services/indexingService.ts`
- Processes ZIP files using JSZip
- Filters out unwanted files (node_modules, .git, binaries, etc.)
- Determines content types based on file extensions
- Stores files in R2 with proper metadata

#### `workers/src/types.ts`
- Defines TypeScript interfaces for upload responses
- Includes error handling types
- Provides type safety for R2 operations

### 3. R2 Storage Structure

Files are stored in R2 with the following key structure:
```
projects/{projectId}/original/{originalFilePath}
```

Example:
```
projects/550e8400-e29b-41d4-a716-446655440000/original/src/main.js
projects/550e8400-e29b-41d4-a716-446655440000/original/README.md
projects/550e8400-e29b-41d4-a716-446655440000/original/package.json
```

### 4. File Filtering

The service automatically filters out:
- Hidden files (except .env files)
- Build directories (node_modules, dist, build, etc.)
- Binary files (images, executables, archives)
- Version control files (.git)
- IDE files (.vscode, .idea)

### 5. Content Type Detection

Supports content type detection for:
- JavaScript/TypeScript files
- Web technologies (HTML, CSS, JSON)
- Programming languages (Python, Java, C++, etc.)
- Configuration files (YAML, TOML, etc.)
- Documentation (Markdown, plain text)

## Configuration

### Wrangler Configuration

```toml
# workers/wrangler.toml
[[r2_buckets]]
binding = "CODE_UPLOADS_BUCKET"
bucket_name = "ai-assistant-code-uploads"
preview_bucket_name = "ai-assistant-code-uploads-preview"
```

### Environment Types

```typescript
// workers/src/types.ts
export interface Env {
  ENVIRONMENT: string;
  CODE_UPLOADS_BUCKET: R2Bucket;
  [key: string]: any;
}
```

## API Response Format

### Success Response (200)

```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "uploaded_files_count": 3,
  "uploaded_file_paths": [
    "src/main.js",
    "README.md",
    "package.json"
  ],
  "errors": []
}
```

### Partial Success (200 with errors)

```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "uploaded_files_count": 2,
  "uploaded_file_paths": [
    "src/main.js",
    "README.md"
  ],
  "errors": [
    {
      "path": "src/broken.js",
      "error": "Failed to upload to R2"
    }
  ]
}
```

### Error Responses

#### Missing File (400)
```json
{
  "error": "BadRequest",
  "message": "Missing codeZipFile in form data. Expected a ZIP file.",
  "code": "MISSING_ZIP_FILE"
}
```

#### Invalid File Type (400)
```json
{
  "error": "BadRequest",
  "message": "Invalid file type. Expected a ZIP file.",
  "code": "INVALID_FILE_TYPE"
}
```

#### File Too Large (400)
```json
{
  "error": "BadRequest",
  "message": "File too large. Maximum size is 50MB.",
  "code": "FILE_TOO_LARGE"
}
```

#### Processing Error (500)
```json
{
  "error": "InternalServerError",
  "message": "Failed to process project upload",
  "code": "UPLOAD_PROCESSING_FAILED",
  "details": "Specific error message"
}
```

## Testing

### Unit Tests

The implementation includes comprehensive unit tests:

- **Handler Tests** (`projectHandlers.test.ts`): Test the endpoint logic
- **Service Tests** (`indexingService.test.ts`): Test ZIP processing and R2 storage

Run tests:
```bash
cd workers
npm test
```

### Integration Testing

A test script is provided in `../test-data/test-upload.sh`:

```bash
cd test-data
./test-upload.sh
```

This script:
1. Creates a sample project ZIP
2. Uploads it to the worker endpoint
3. Displays the response and project ID

### Manual Testing with curl

```bash
curl -X POST http://localhost:8787/api/project/upload \
     -F "codeZipFile=@sample-project.zip"
```

## Development Workflow

### Local Development

1. **Start the worker**:
   ```bash
   cd workers
   npm run dev
   ```

2. **Test the endpoint**:
   ```bash
   cd ../test-data
   ./test-upload.sh
   ```

### Deployment

1. **Deploy to staging**:
   ```bash
   cd workers
   npm run deploy:staging
   ```

2. **Deploy to production**:
   ```bash
   npm run deploy
   ```

## Security Considerations

1. **File Size Limits**: Maximum 50MB per upload
2. **File Type Validation**: Only ZIP files accepted
3. **Content Filtering**: Automatic filtering of potentially harmful files
4. **Project Isolation**: Each project gets a unique namespace in R2
5. **Error Handling**: Graceful handling of malformed ZIPs and R2 errors

## Performance Considerations

1. **Streaming**: Files are processed and uploaded to R2 as they're extracted
2. **Memory Management**: Large files are handled efficiently with ArrayBuffers
3. **Parallel Processing**: Multiple files can be processed concurrently
4. **Error Isolation**: Individual file failures don't stop the entire upload

## Monitoring and Observability

The implementation includes:
- Structured logging for upload progress
- Error tracking with detailed error messages
- Request ID tracking for debugging
- Performance metrics through console logging

## Future Enhancements

1. **Progress Tracking**: Real-time upload progress via WebSockets
2. **Chunked Uploads**: Support for very large files via chunked upload
3. **File Deduplication**: Avoid storing duplicate files
4. **Compression**: Compress files before storing in R2
5. **Virus Scanning**: Integrate with security scanning services

## Dependencies

- **JSZip**: ZIP file processing
- **Hono**: Web framework for Cloudflare Workers
- **Zod**: Runtime type validation
- **Vitest**: Testing framework

## Related RFCs

- **RFC-IDX-001**: Codebase Indexing Pipeline
- **RFC-API-001**: Core Backend API Design
- **RFC-SEC-001**: Security and BYOK Implementation 