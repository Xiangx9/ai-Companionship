const fs = require('fs');
const path = 'D:\\work\\AI\\ai-manga-factory\\src\\services\\aiEngine.ts';
let content = fs.readFileSync(path, 'utf-8');

const startMarker = 'function cleanJson(text: string): string {';
const si = content.indexOf(startMarker);
if (si === -1) { console.log('cleanJson not found'); process.exit(1); }

let bc = 0, fe = si, started = false;
for (let i = si; i < content.length; i++) {
  if (content[i] === '{') { bc++; started = true; }
  if (content[i] === '}') { bc--; }
  if (started && bc === 0) { fe = i + 1; break; }
}

const newFunc = [
  'function cleanJson(text: string): string {',
  "  let result = text.replace(/`\\s*json\\s*/gi, '').replace(/`/g, '').trim();",
  '  try { JSON.parse(result); return result; }',
  '  catch(e) {',
  '    // Try fixing unquoted keys first (safer than replacing all single quotes)',
  "    result = result.replace(/(\\{|,)\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*:/g, '$1\"$2\":');",
  '    try { JSON.parse(result); return result; }',
  '    catch(e2) {',
  '      // Last resort: replace single quotes',
      "      result = result.replace(/'/g, '\"');",
      "      result = result.replace(/\"\"/g, '\"');",
  '      return result;',
  '    }',
  '  }',
  '}'
].join('\n');

content = content.substring(0, si) + newFunc + content.substring(fe);
fs.writeFileSync(path, content, 'utf-8');
console.log('Fixed cleanJson in aiEngine.ts');
