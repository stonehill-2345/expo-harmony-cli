import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const read = file => JSON.parse(fs.readFileSync(file));
export const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2)+'\n', {flag:'wx'});
export const inside = (root, file) => { const r=path.relative(root,file); return r!== '..' && !r.startsWith('../') && !path.isAbsolute(r); };
export function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..')) throw Error('Unsafe relative path');
  const base=fs.realpathSync(root), file=fs.realpathSync(path.join(base,relative));
  if (!inside(base,file) || !fs.statSync(file).isFile()) throw Error('Path escape or non-file');
  return file;
}
export function resolveMapped(original, mappings) {
  if (original.includes('\\') || original.split('/').includes('..')) throw Error('Unsafe mapping escape');
  const matches=mappings.filter(m=>original===m.from || original.startsWith(m.from+'/'));
  if(matches.length!==1) throw Error(matches.length?'Ambiguous mapping':'Missing path mapping: '+original);
  const m=matches[0]; return safeFile(m.to,original.slice(m.from.length+1));
}
export function verifyReceipts(refs,mappings) {
  return refs.map(ref=>{
    const file=resolveMapped(ref.path,mappings), bytes=fs.readFileSync(file), hash=sha256(bytes);
    if(!/^[a-f0-9]{64}$/.test(ref.sha256??'') || hash!==ref.sha256 || ref.bytes!==undefined && ref.bytes!==bytes.length) throw Error('Receipt hash/size mismatch: '+ref.path);
    return {originalPath:ref.path,localPath:file,bytes:bytes.length,sha256:hash,status:'RESTORED_ORIGINAL_BYTES'};
  });
}
export function newOutput(output) { fs.mkdirSync(output,{recursive:false}); return path.resolve(output); }
export function args(argv, allowed) {
 const value={};
 for(let i=0;i<argv.length;i+=2) {
  const key=argv[i]?.replace(/^--/,'');
  if(!argv[i]?.startsWith('--') || !allowed.includes(key) || !argv[i+1] || value[key]) throw Error('Invalid arguments: '+argv[i]);
  value[key]=argv[i+1];
 }
 return value;
}
export const escapeHtml = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function html(title, value) { return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>'+escapeHtml(title)+'</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto;padding:24px;background:#f4f6fa;color:#18243a}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:24px;border-radius:12px}a{color:#125bc7}</style><h1>'+escapeHtml(title)+'</h1><pre>'+escapeHtml(JSON.stringify(value,null,2))+'</pre></html>'; }
