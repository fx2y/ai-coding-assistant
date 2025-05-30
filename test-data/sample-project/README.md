# Sample Project

This is a sample project for testing the AI Coding Assistant upload functionality.

## Features

- Basic JavaScript functions
- Calculator class with history
- Modular exports

## Usage

```javascript
const { greet, Calculator } = require('./src/main.js');

console.log(greet('World'));

const calc = new Calculator();
console.log(calc.add(2, 3));
console.log(calc.getHistory());
```

## Files

- `src/main.js` - Main JavaScript file with utility functions
- `package.json` - Node.js package configuration
- `README.md` - This file 