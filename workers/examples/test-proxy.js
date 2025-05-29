#!/usr/bin/env node

/**
 * Integration test script for the external API proxy
 * Run with: node examples/test-proxy.js
 * 
 * This script demonstrates how to use the proxy with actual external services.
 * You'll need valid API keys to test against real services.
 */

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';

async function testProxyHealth() {
  console.log('🔍 Testing proxy health...');
  
  try {
    const response = await fetch(`${WORKER_URL}/api/proxy/health`);
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Proxy is healthy:', result.data);
    } else {
      console.log('❌ Proxy health check failed:', result.error);
    }
  } catch (error) {
    console.log('❌ Failed to reach proxy:', error.message);
  }
}

async function testSupportedServices() {
  console.log('\n📋 Getting supported services...');
  
  try {
    const response = await fetch(`${WORKER_URL}/api/proxy/services`);
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Supported services:', result.data.services);
    } else {
      console.log('❌ Failed to get services:', result.error);
    }
  } catch (error) {
    console.log('❌ Failed to reach proxy:', error.message);
  }
}

async function testOpenAIChat(apiKey) {
  console.log('\n🤖 Testing OpenAI Chat...');
  
  if (!apiKey) {
    console.log('⚠️  Skipping OpenAI test - no API key provided');
    return;
  }
  
  try {
    const response = await fetch(`${WORKER_URL}/api/proxy/external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: 'openai_chat',
        api_key: apiKey,
        payload: {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'user', content: 'Say hello in exactly 3 words.' }
          ],
          max_tokens: 10
        }
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      const message = result.data?.choices?.[0]?.message?.content;
      console.log('✅ OpenAI response:', message);
    } else {
      console.log('❌ OpenAI test failed:', result.error || result);
    }
  } catch (error) {
    console.log('❌ OpenAI test error:', error.message);
  }
}

async function testInvalidService() {
  console.log('\n🛡️  Testing security - invalid service...');
  
  try {
    const response = await fetch(`${WORKER_URL}/api/proxy/external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: 'malicious_service',
        api_key: 'test-key',
        payload: { malicious: 'data' }
      })
    });
    
    const result = await response.json();
    
    if (response.status === 400 && result.error === 'ValidationError') {
      console.log('✅ Security test passed - invalid service rejected');
    } else {
      console.log('❌ Security test failed - invalid service not rejected');
    }
  } catch (error) {
    console.log('❌ Security test error:', error.message);
  }
}

async function testInvalidApiKey() {
  console.log('\n🔑 Testing error handling - invalid API key...');
  
  try {
    const response = await fetch(`${WORKER_URL}/api/proxy/external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_service: 'openai_chat',
        api_key: 'invalid-key',
        payload: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }]
        }
      })
    });
    
    const result = await response.json();
    
    if (response.status === 401 && result.error === 'ExternalServiceError') {
      console.log('✅ Error handling test passed - invalid API key properly handled');
    } else {
      console.log('❌ Error handling test failed:', result);
    }
  } catch (error) {
    console.log('❌ Error handling test error:', error.message);
  }
}

async function main() {
  console.log('🚀 Testing AI Coding Assistant External API Proxy');
  console.log(`📍 Worker URL: ${WORKER_URL}`);
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (openaiApiKey) {
    console.log('🔑 Using provided OpenAI API key for integration tests');
  } else {
    console.log('⚠️  No OPENAI_API_KEY provided - will skip integration tests');
    console.log('   Set OPENAI_API_KEY environment variable to test with real API');
  }
  
  await testProxyHealth();
  await testSupportedServices();
  await testInvalidService();
  await testInvalidApiKey();
  await testOpenAIChat(openaiApiKey);
  
  console.log('\n✨ Integration tests completed!');
}

// Handle unhandled promises
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
}); 