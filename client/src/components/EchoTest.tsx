/**
 * Echo Test Component - Tests the /api/echo endpoint
 * Implements client-side testing for RFC-API-001 echo endpoint
 */

import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact/compat';

interface EchoTestState {
  isLoading: boolean;
  response: any;
  error: string | null;
}

export function EchoTest() {
  const [state, setState] = useState<EchoTestState>({
    isLoading: false,
    response: null,
    error: null
  });

  const [inputData, setInputData] = useState('{"message": "Hello from client", "timestamp": "' + new Date().toISOString() + '"}');

  const testEcho = async () => {
    setState({ isLoading: true, response: null, error: null });

    try {
      let payload;
      try {
        payload = JSON.parse(inputData);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        throw new Error('Invalid JSON input: ' + errorMessage);
      }

      const response = await fetch('/api/echo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      setState({
        isLoading: false,
        response: result,
        error: null
      });
    } catch (error) {
      setState({
        isLoading: false,
        response: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const testInvalidJson = async () => {
    setState({ isLoading: true, response: null, error: null });

    try {
      const response = await fetch('/api/echo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"message": "unterminated string'
      });

      const result = await response.json();

      setState({
        isLoading: false,
        response: result,
        error: null
      });
    } catch (error) {
      setState({
        isLoading: false,
        response: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  const handleInputChange = (e: TargetedEvent<HTMLTextAreaElement, Event>) => {
    if (e.target) {
      setInputData((e.target as HTMLTextAreaElement).value);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Echo Endpoint Test</h2>
      <p>Test the <code>/api/echo</code> endpoint that echoes back JSON payloads.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Input JSON:</h3>
        <textarea
          value={inputData}
          onChange={handleInputChange}
          style={{
            width: '100%',
            height: '100px',
            fontFamily: 'monospace',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
          placeholder="Enter JSON payload to echo"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testEcho}
          disabled={state.isLoading}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: state.isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {state.isLoading ? 'Testing...' : 'Test Echo'}
        </button>
        
        <button 
          onClick={testInvalidJson}
          disabled={state.isLoading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: state.isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          Test Invalid JSON
        </button>
      </div>

      {state.error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <h4>Error:</h4>
          <pre>{state.error}</pre>
        </div>
      )}

      {state.response && (
        <div style={{
          padding: '15px',
          backgroundColor: '#d1ecf1',
          color: '#0c5460',
          border: '1px solid #bee5eb',
          borderRadius: '4px'
        }}>
          <h4>Response:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {JSON.stringify(state.response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
} 