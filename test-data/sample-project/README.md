# Sample Project

This is a sample project for testing the AI Coding Assistant chunking functionality.

## Overview

The project contains various file types to test different chunking strategies:

- JavaScript files (`.js`)
- Python files (`.py`)
- Markdown files (`.md`)
- Configuration files

## Features

### Language Detection

The chunking system automatically detects programming languages based on:

1. File extensions
2. Content patterns
3. Shebang lines

### Chunking Strategies

#### Generic Text Chunking

For files that don't have specific language support, the system uses generic text chunking:

- Splits by lines and character count
- Maintains configurable overlap between chunks
- Preserves line number information

#### Language-Aware Chunking

For supported programming languages, the system attempts to preserve semantic boundaries:

- **JavaScript/TypeScript**: Splits at function and class declarations
- **Python**: Splits at function and class definitions
- **Markdown**: Splits at header boundaries

## Configuration

The chunking system supports the following configuration options:

```javascript
{
  maxChunkSize: 1500,        // Maximum characters per chunk
  chunkOverlap: 200,         // Overlap characters between chunks
  maxLinesPerChunk: 75,      // Maximum lines per chunk
  preserveCodeBlocks: true   // Try to keep code blocks intact
}
```

## Testing

To test the chunking functionality:

1. Upload this project as a ZIP file
2. Call the chunking endpoint
3. Verify chunks are created in R2
4. Check metadata is stored in KV

## File Structure

```
sample-project/
├── src/
│   ├── example.js
│   ├── example.py
│   └── utils/
│       └── helpers.js
├── README.md
└── package.json
```

## Expected Results

The chunking process should:

- Create multiple chunks per file based on content size
- Preserve semantic boundaries where possible
- Store chunk metadata with accurate line numbers
- Handle different file types appropriately 