/**
 * Tokenizer Service
 * Implements RFC-CTX-003: Dynamic Context Window Management
 * 
 * Provides token counting capabilities with tiktoken-rs WASM support
 * and fallback heuristics for different LLM models.
 */

// Type definitions for tiktoken-rs WASM (when available)
interface TiktokenEncoder {
  encode(text: string): Uint32Array;
  decode(tokens: Uint32Array): string;
  free(): void;
}

interface TiktokenModule {
  get_encoding(encoding_name: string): TiktokenEncoder;
  encoding_for_model(model_name: string): TiktokenEncoder;
}

// Global tokenizer cache
let tiktokenModule: TiktokenModule | null = null;
const encoderCache = new Map<string, TiktokenEncoder>();

/**
 * LLM model configurations with token limits and encoding info
 */
export interface LLMModelConfig {
  modelName: string;
  tokenLimit: number;
  reservedOutputTokens: number;
  encoding?: string; // tiktoken encoding name
  provider: 'openai' | 'anthropic' | 'cohere' | 'other';
}

/**
 * Predefined model configurations
 */
export const MODEL_CONFIGS: Record<string, LLMModelConfig> = {
  // OpenAI Models
  'gpt-3.5-turbo': {
    modelName: 'gpt-3.5-turbo',
    tokenLimit: 16385,
    reservedOutputTokens: 2000,
    encoding: 'cl100k_base',
    provider: 'openai'
  },
  'gpt-3.5-turbo-16k': {
    modelName: 'gpt-3.5-turbo-16k',
    tokenLimit: 16385,
    reservedOutputTokens: 2000,
    encoding: 'cl100k_base',
    provider: 'openai'
  },
  'gpt-4': {
    modelName: 'gpt-4',
    tokenLimit: 8192,
    reservedOutputTokens: 1500,
    encoding: 'cl100k_base',
    provider: 'openai'
  },
  'gpt-4-turbo': {
    modelName: 'gpt-4-turbo',
    tokenLimit: 128000,
    reservedOutputTokens: 4000,
    encoding: 'cl100k_base',
    provider: 'openai'
  },
  'gpt-4o': {
    modelName: 'gpt-4o',
    tokenLimit: 128000,
    reservedOutputTokens: 4000,
    encoding: 'o200k_base',
    provider: 'openai'
  },
  
  // Anthropic Models
  'claude-3-haiku': {
    modelName: 'claude-3-haiku',
    tokenLimit: 200000,
    reservedOutputTokens: 4000,
    provider: 'anthropic'
  },
  'claude-3-sonnet': {
    modelName: 'claude-3-sonnet',
    tokenLimit: 200000,
    reservedOutputTokens: 4000,
    provider: 'anthropic'
  },
  'claude-3-opus': {
    modelName: 'claude-3-opus',
    tokenLimit: 200000,
    reservedOutputTokens: 4000,
    provider: 'anthropic'
  },
  
  // Cohere Models
  'command': {
    modelName: 'command',
    tokenLimit: 4096,
    reservedOutputTokens: 1000,
    provider: 'cohere'
  },
  'command-nightly': {
    modelName: 'command-nightly',
    tokenLimit: 4096,
    reservedOutputTokens: 1000,
    provider: 'cohere'
  }
};

/**
 * Token counting result with metadata
 */
export interface TokenCountResult {
  tokenCount: number;
  method: 'tiktoken' | 'heuristic';
  encoding?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Initialize tiktoken-rs WASM module (if available)
 * This is a placeholder for future WASM integration
 */
async function initializeTiktoken(): Promise<boolean> {
  try {
    // TODO: Implement actual tiktoken-rs WASM loading
    // This would involve:
    // 1. Loading the WASM module
    // 2. Initializing the tiktoken bindings
    // 3. Caching the module for reuse
    
    // For now, return false to use heuristic fallback
    console.log('[Tokenizer] tiktoken-rs WASM not yet implemented, using heuristic fallback');
    return false;
  } catch (error) {
    console.warn('[Tokenizer] Failed to initialize tiktoken-rs WASM:', error);
    return false;
  }
}

/**
 * Get or create tiktoken encoder for a specific encoding
 */
async function getTiktokenEncoder(encoding: string): Promise<TiktokenEncoder | null> {
  if (!tiktokenModule) {
    const initialized = await initializeTiktoken();
    if (!initialized) return null;
  }
  
  if (!tiktokenModule) return null;
  
  if (encoderCache.has(encoding)) {
    return encoderCache.get(encoding)!;
  }
  
  try {
    const encoder = tiktokenModule.get_encoding(encoding);
    encoderCache.set(encoding, encoder);
    return encoder;
  } catch (error) {
    console.warn(`[Tokenizer] Failed to get encoder for ${encoding}:`, error);
    return null;
  }
}

/**
 * Count tokens using tiktoken-rs WASM (when available)
 */
async function countTokensWithTiktoken(text: string, encoding: string): Promise<number | null> {
  const encoder = await getTiktokenEncoder(encoding);
  if (!encoder) return null;
  
  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    console.warn('[Tokenizer] tiktoken encoding failed:', error);
    return null;
  }
}

/**
 * Heuristic token counting based on character/word analysis
 * Different heuristics for different model providers
 */
function countTokensHeuristic(text: string, provider: string): TokenCountResult {
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
  
  let tokenCount: number;
  let confidence: 'high' | 'medium' | 'low';
  
  switch (provider) {
    case 'openai':
      // OpenAI: ~4 chars per token for English text, ~3.5 for code
      // More conservative estimate for mixed content
      tokenCount = Math.ceil(charCount / 3.8);
      confidence = 'medium';
      break;
      
    case 'anthropic':
      // Claude: Similar to OpenAI but slightly different tokenization
      tokenCount = Math.ceil(charCount / 3.9);
      confidence = 'medium';
      break;
      
    case 'cohere':
      // Cohere: Roughly similar to OpenAI
      tokenCount = Math.ceil(charCount / 3.7);
      confidence = 'medium';
      break;
      
    default:
      // Generic fallback: conservative estimate
      tokenCount = Math.ceil(charCount / 3.5);
      confidence = 'low';
  }
  
  // Adjust for very short texts (tokens can't be less than words)
  tokenCount = Math.max(tokenCount, wordCount);
  
  return {
    tokenCount,
    method: 'heuristic',
    confidence
  };
}

/**
 * Main token counting function with automatic fallback
 */
export async function countTokens(
  text: string, 
  modelConfig: LLMModelConfig
): Promise<TokenCountResult> {
  // Try tiktoken-rs WASM first (for OpenAI models with encoding)
  if (modelConfig.encoding && modelConfig.provider === 'openai') {
    const tiktokenCount = await countTokensWithTiktoken(text, modelConfig.encoding);
    if (tiktokenCount !== null) {
      return {
        tokenCount: tiktokenCount,
        method: 'tiktoken',
        encoding: modelConfig.encoding,
        confidence: 'high'
      };
    }
  }
  
  // Fallback to heuristic counting
  return countTokensHeuristic(text, modelConfig.provider);
}

/**
 * Get model configuration by name with fallback to default
 */
export function getModelConfig(modelName: string): LLMModelConfig {
  const config = MODEL_CONFIGS[modelName];
  if (config) {
    return config;
  }
  
  // Fallback for unknown models
  console.warn(`[Tokenizer] Unknown model ${modelName}, using default config`);
  return {
    modelName,
    tokenLimit: 8192,
    reservedOutputTokens: 1500,
    provider: 'other'
  };
}

/**
 * Calculate available prompt tokens given model config
 */
export function getAvailablePromptTokens(modelConfig: LLMModelConfig): number {
  return Math.max(0, modelConfig.tokenLimit - modelConfig.reservedOutputTokens);
}

/**
 * Estimate character count for a given token budget (for truncation)
 */
export function estimateCharsForTokens(tokenBudget: number, provider: string): number {
  switch (provider) {
    case 'openai':
      return Math.floor(tokenBudget * 3.8);
    case 'anthropic':
      return Math.floor(tokenBudget * 3.9);
    case 'cohere':
      return Math.floor(tokenBudget * 3.7);
    default:
      return Math.floor(tokenBudget * 3.5);
  }
}

/**
 * Cleanup function to free tiktoken encoders
 */
export function cleanupTokenizers(): void {
  for (const encoder of encoderCache.values()) {
    try {
      encoder.free();
    } catch (error) {
      console.warn('[Tokenizer] Error freeing encoder:', error);
    }
  }
  encoderCache.clear();
  tiktokenModule = null;
} 