/**
 * Simple test script for chunking functionality
 * Run with: node test-chunking.js
 */

// Mock the types and dependencies for testing
const mockChunkingConfig = {
  maxChunkSize: 1500,
  chunkOverlap: 200,
  maxLinesPerChunk: 75,
  preserveCodeBlocks: true
};

// Test language detection
function testLanguageDetection() {
  console.log('Testing language detection...');
  
  // Test cases
  const testCases = [
    { path: 'example.js', expected: 'javascript' },
    { path: 'example.py', expected: 'python' },
    { path: 'README.md', expected: 'markdown' },
    { path: 'config.json', expected: 'json' },
    { path: 'styles.css', expected: 'css' },
    { path: 'unknown.xyz', expected: 'text' }
  ];
  
  // Simple language detection function (simplified version)
  function detectLanguage(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const extensionMap = {
      'js': 'javascript',
      'py': 'python',
      'md': 'markdown',
      'json': 'json',
      'css': 'css'
    };
    return extensionMap[extension] || 'text';
  }
  
  testCases.forEach(({ path, expected }) => {
    const result = detectLanguage(path);
    console.log(`  ${path}: ${result} ${result === expected ? '✓' : '✗'}`);
  });
}

// Test chunking logic
function testChunking() {
  console.log('\nTesting chunking logic...');
  
  const sampleJavaScript = `
/**
 * Sample JavaScript file
 */

function greet(name) {
  return \`Hello, \${name}!\`;
}

class Calculator {
  constructor() {
    this.result = 0;
  }

  add(value) {
    this.result += value;
    return this;
  }

  getResult() {
    return this.result;
  }
}

export { greet, Calculator };
`.trim();

  // Simple chunking function (simplified version)
  function simpleChunk(content, maxLines = 20) {
    const lines = content.split('\n');
    const chunks = [];
    
    for (let i = 0; i < lines.length; i += maxLines) {
      const chunkLines = lines.slice(i, i + maxLines);
      chunks.push({
        text: chunkLines.join('\n'),
        startLine: i + 1,
        endLine: i + chunkLines.length,
        language: 'javascript'
      });
    }
    
    return chunks;
  }
  
  const chunks = simpleChunk(sampleJavaScript, 15);
  console.log(`  Created ${chunks.length} chunks`);
  chunks.forEach((chunk, index) => {
    console.log(`  Chunk ${index + 1}: lines ${chunk.startLine}-${chunk.endLine} (${chunk.text.length} chars)`);
  });
}

// Test metadata structure
function testMetadata() {
  console.log('\nTesting metadata structure...');
  
  const sampleMetadata = {
    id: 'test-chunk-id',
    projectId: 'test-project-id',
    originalFilePath: 'src/example.js',
    r2ChunkPath: 'projects/test-project-id/chunks/test-chunk-id.txt',
    startLine: 1,
    endLine: 25,
    charCount: 500,
    language: 'javascript',
    createdAt: new Date().toISOString()
  };
  
  console.log('  Sample metadata structure:');
  console.log('  ', JSON.stringify(sampleMetadata, null, 2));
  
  // Validate required fields
  const requiredFields = ['id', 'projectId', 'originalFilePath', 'r2ChunkPath', 'startLine', 'endLine', 'charCount', 'createdAt'];
  const missingFields = requiredFields.filter(field => !sampleMetadata[field]);
  
  if (missingFields.length === 0) {
    console.log('  ✓ All required fields present');
  } else {
    console.log('  ✗ Missing fields:', missingFields);
  }
}

// Run tests
console.log('=== Chunking Functionality Tests ===\n');

testLanguageDetection();
testChunking();
testMetadata();

console.log('\n=== Tests Complete ===');
console.log('\nTo test the full implementation:');
console.log('1. Upload a ZIP file to /api/project/upload');
console.log('2. Call /api/project/{projectId}/process_chunks');
console.log('3. Verify chunks in R2 and metadata in KV'); 