const keywords = ['error', 'wrong', 'incorrect', 'failed', 'didn\'t work', 'not working', 'bug', 'broken', 'issue', 'problem', 'mistake', 'fix', 'crash', 'exception'];
const directIndicators = ['that', 'your', 'the code', 'previous', 'last'];

const testPhrases = [
  'That\'s wrong',
  'This is incorrect', 
  'The code failed',
  'Your code didn\'t work',
  'There\'s a bug in that',
  'Your solution is broken',
  'There\'s an issue with your code',
  'That\'s a mistake',
  'Please fix that',
  'Your code crashes when I run it'
];

console.log('Testing keyword and indicator detection:');
testPhrases.forEach(phrase => {
  const lower = phrase.toLowerCase();
  const hasKeyword = keywords.some(k => lower.includes(k));
  const hasIndicator = directIndicators.some(i => lower.includes(i));
  console.log(`"${phrase}": keyword=${hasKeyword}, indicator=${hasIndicator}, both=${hasKeyword && hasIndicator}`);
});

// Test the specific failing case
const failingCase = 'That validation is too simple and will accept invalid emails like "a@" or "@b"';
const lower = failingCase.toLowerCase();
const hasKeyword = keywords.some(k => lower.includes(k));
const hasIndicator = directIndicators.some(i => lower.includes(i));
console.log(`\nFailing test case: "${failingCase}"`);
console.log(`keyword=${hasKeyword}, indicator=${hasIndicator}, both=${hasKeyword && hasIndicator}`); 