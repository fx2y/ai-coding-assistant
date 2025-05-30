/**
 * Sample JavaScript file for testing chunking functionality
 * This file contains various code structures to test language-aware chunking
 */

// Simple function
function greet(name) {
  return `Hello, ${name}!`;
}

// Class definition
class Calculator {
  constructor() {
    this.result = 0;
  }

  add(value) {
    this.result += value;
    return this;
  }

  subtract(value) {
    this.result -= value;
    return this;
  }

  multiply(value) {
    this.result *= value;
    return this;
  }

  divide(value) {
    if (value === 0) {
      throw new Error('Division by zero');
    }
    this.result /= value;
    return this;
  }

  getResult() {
    return this.result;
  }

  reset() {
    this.result = 0;
    return this;
  }
}

// Async function
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

// Arrow functions and modern JS features
const processArray = (arr) => {
  return arr
    .filter(item => item !== null && item !== undefined)
    .map(item => typeof item === 'string' ? item.trim() : item)
    .reduce((acc, item) => {
      if (typeof item === 'number') {
        acc.numbers.push(item);
      } else if (typeof item === 'string') {
        acc.strings.push(item);
      }
      return acc;
    }, { numbers: [], strings: [] });
};

// Export statements
export { greet, Calculator, fetchData, processArray };
export default Calculator; 