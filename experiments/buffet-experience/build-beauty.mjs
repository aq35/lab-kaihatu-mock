import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const material = readFileSync(join(here,'material4.json'),'utf8').trim().replace(/<\//g,'<\\/');
const img = readFileSync(join(here,'roastbeef.jpg'));
const dataUri = 'data:image/jpeg;base64,' + img.toString('base64');
mkdirSync('dist/buffet',{recursive:true});
for(const name of ['beauty','beauty-light']){
  let tpl = readFileSync(join(here,name+'.html'),'utf8');
  if(!tpl.includes('__IMG__')||!tpl.includes('__FIXTURE__')) throw new Error(name+': placeholder 不足');
  tpl = tpl.replace('__IMG__',()=>dataUri).replace('__FIXTURE__',()=>material);
  writeFileSync('dist/buffet/'+name+'.html', tpl);
  console.log('dist/buffet/'+name+'.html', (tpl.length/1024|0)+'KB');
}
