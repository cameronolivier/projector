#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read package.json to get the version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);
const version = packageJson.version;

// Update src/index.ts
const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
let indexContent = fs.readFileSync(indexPath, 'utf-8');

// Replace the VERSION constant
indexContent = indexContent.replace(
  /const VERSION = ['"][^'"]+['"]/,
  `const VERSION = '${version}'`
);

fs.writeFileSync(indexPath, indexContent, 'utf-8');
console.log(`✓ Updated VERSION to ${version} in src/index.ts`);
