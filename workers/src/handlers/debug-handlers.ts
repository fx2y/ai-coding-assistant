/**
 * Debug and utility endpoint handlers
 * Implements RFC-API-001: Core Backend API Design
 */

import type { Context } from 'hono';
import type { Env } from '../types.js';
import { z } from 'zod';

// Schema for echo endpoint validation
export const EchoRequestSchema = z.unknown(); // Accepts any JSON

/**
 * Echo endpoint handler - returns the same JSON payload that was sent
 * POST /api/echo
 */
export async function echoHandler(c: Context<{ Bindings: Env; Variables: { requestId: string } }>): Promise<Response> {
  try {
    const body = await c.req.json();

    // Return the exact same payload that was received
    return c.json({
      success: true,
      data: body,
      requestId: c.get('requestId')
    });
  } catch (error) {
    // Handle invalid JSON or other parsing errors
    return c.json({
      success: false,
      error: {
        error: 'InvalidInput',
        message: 'Invalid JSON payload or processing error',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: c.get('requestId')
      }
    }, 400);
  }
}