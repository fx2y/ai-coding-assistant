/**
 * Debug Handlers - Development and testing utilities
 * Implements P1-E2-S2: DX focus for inspecting Vectorize index
 */

import { Context } from 'hono';
import type { Env, ApiResponse } from '../types.js';

/**
 * GET /api/debug/vectorize/info
 * Returns Vectorize index information and statistics
 */
export async function getVectorizeInfo(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const { getIndexInfo } = await import('../lib/vectorizeClient.js');
    
    const indexInfo = await getIndexInfo(c.env.VECTORIZE_INDEX);
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        indexInfo,
        timestamp: new Date().toISOString()
      }
    };

    return c.json(response);
    
  } catch (error) {
    console.error('Failed to get Vectorize index info:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        error: 'VECTORIZE_INFO_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get index information'
      }
    };

    return c.json(response, 500);
  }
}

/**
 * POST /api/debug/vectorize/query
 * Test query against Vectorize index with a sample vector
 */
export async function testVectorizeQuery(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { projectId, sampleText, topK = 5 } = body;

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: {
          error: 'MISSING_PROJECT_ID',
          message: 'Project ID is required for testing queries'
        }
      };
      return c.json(response, 400);
    }

    // For testing, we'll create a simple query vector (in production this would come from embedding the sampleText)
    // This is just for debugging - a real implementation would generate embeddings for the sampleText
    const testVector = new Array(1536).fill(0).map(() => Math.random() * 0.1); // Random small values for testing

    const { queryVectors } = await import('../lib/vectorizeClient.js');
    
    const queryResult = await queryVectors(
      c.env.VECTORIZE_INDEX,
      testVector,
      topK,
      { projectId } // Filter by project
    );

    const response: ApiResponse<any> = {
      success: true,
      data: {
        query: {
          projectId,
          sampleText,
          topK,
          vectorDimensions: testVector.length
        },
        results: queryResult,
        timestamp: new Date().toISOString()
      }
    };

    return c.json(response);
    
  } catch (error) {
    console.error('Failed to test Vectorize query:', error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        error: 'VECTORIZE_QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Failed to test query'
      }
    };

    return c.json(response, 500);
  }
} 