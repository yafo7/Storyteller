import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'generated', '60-build', 'production.json');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const value = JSON.parse(fs.readFileSync(source, 'utf8'));
fs.writeFileSync(path.join(dataDir, 'production.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'pass', source: path.relative(root, source), output: 'data/production.json', maps: Object.keys(value.maps).length }, null, 2));
