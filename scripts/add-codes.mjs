// 用法：node scripts/add-codes.mjs "<任意文字、網址、或 12 碼 id>" [--source 來源]
//      node scripts/add-codes.mjs --file 檔案.txt
// 從輸入裡抓出所有星級遊戲 QR（liff 網址的 q 參數，或單獨的 12 位 hex），
// 已存在的略過，新的以標準網址附加到 data/codes.json。
// 新增的項目沒有任何兌換記錄，網站預設顯示為「未兌換」。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LIFF_ID = '2010522144-5nZYW3pn';
const file = fileURLToPath(new URL('../data/codes.json', import.meta.url));
const summaryFile = fileURLToPath(new URL('../data/summary.json', import.meta.url));

const args = process.argv.slice(2);
let source = '手動新增';
const parts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source') source = args[++i];
  else if (args[i] === '--file') parts.push(readFileSync(args[++i], 'utf8'));
  else parts.push(args[i]);
}
const text = parts.join('\n');
if (!text.trim()) { console.error('沒有輸入內容'); process.exit(1); }

const found = new Set();
for (const m of text.matchAll(/liff\.line\.me\/[\w-]+\?q=([0-9a-fA-F]{12})(?![0-9a-fA-F])/g)) found.add(m[1].toLowerCase());
for (const m of text.matchAll(/(?<![0-9a-zA-Z=])([0-9a-f]{12})(?![0-9a-zA-Z])/g)) found.add(m[1]);

const codes = JSON.parse(readFileSync(file, 'utf8'));
const have = new Set(codes.map((c) => c.id));
const today = new Date().toISOString().slice(0, 10);
const added = [];
for (const id of found) {
  if (have.has(id)) continue;
  codes.push({ id, code: '', url: `https://liff.line.me/${LIFF_ID}?q=${id}`, addedAt: today, source, redeemed: false });
  added.push(id);
}

if (added.length) {
  writeFileSync(file, JSON.stringify(codes, null, 2) + '\n');
  const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
  summary.updatedAt = today;
  writeFileSync(summaryFile, JSON.stringify(summary) + '\n');
}
console.log(`找到 ${found.size} 個，新增 ${added.length} 個，重複 ${found.size - added.length} 個，目前共 ${codes.length} 個`);
for (const id of added) console.log('  +', id);
