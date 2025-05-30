/**
 * Sample JavaScript file for testing the upload functionality
 */

function greet(name) {
  return `Hello, ${name}!`;
}

function calculateSum(a, b) {
  return a + b;
}

class Calculator {
  constructor() {
    this.history = [];
  }
  
  add(a, b) {
    const result = a + b;
    this.history.push(`${a} + ${b} = ${result}`);
    return result;
  }
  
  getHistory() {
    return this.history;
  }
}

module.exports = {
  greet,
  calculateSum,
  Calculator
}; 