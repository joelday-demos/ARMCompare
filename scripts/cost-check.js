// Example: replace with your real logic

const fs = require('fs');

// You can parse what-if output if needed
const whatIf = JSON.parse(fs.readFileSync('whatif.json', 'utf8'));

// TODO: replace this with real cost calculation
const estimatedCost = 125.50;

// IMPORTANT: only output the number
console.log(estimatedCost);