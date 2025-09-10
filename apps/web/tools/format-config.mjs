import fs from 'fs';
import path from 'path';

let file = process.argv[2] || '.config.json';

const fileData = fs.readFileSync(path.join('./tools', file), 'utf-8');

console.log(`
API_SETTINGS=${JSON.stringify(JSON.parse(fileData))}
`);