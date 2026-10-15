// Architectural guard: every page uses the shared frame, directly or by delegation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function framed(file,seen=new Set()){
 file=path.resolve(file);if(seen.has(file)||!fs.existsSync(file))return false;seen.add(file);
 const code=fs.readFileSync(file,'utf8');if(/<Screen(?:\s|>)/.test(code))return true;
 for(const [,spec]of code.matchAll(/from\s+["']([^"']+)["']/g)){
  if(!spec.startsWith('@/components/')&&!spec.startsWith('.'))continue;
  const target=spec.startsWith('@/')?path.resolve('src',spec.slice(2)):path.resolve(path.dirname(file),spec);
  if(framed(target+'.tsx',seen))return true;
 }
 return false;
}
const pages=walk('app').filter(f=>f.endsWith('.tsx')&&!f.endsWith('_layout.tsx')&&f!==path.join('app','index.tsx'));
for(const f of pages)assert(framed(f),'Missing common frame: '+f);
const theme=fs.readFileSync('src/constants/theme.ts','utf8');assert.match(theme,/title: 22/);assert.match(theme,/action: '#9DEB22'/);
const screen=fs.readFileSync('src/components/ui/Screen.tsx','utf8');assert.match(screen,/width >= 1024/);assert.match(screen,/<DesktopNavigation/);assert.match(screen,/maxWidth: 1180/);assert.match(screen,/keyboardShouldPersistTaps="handled"/);
assert.match(fs.readFileSync('src/components/ui/Button.tsx','utf8'),/small: \{\s+minHeight: 44/);
assert.match(fs.readFileSync('app/(tabs)/_layout.tsx','utf8'),/display: desktop \? 'none' : 'flex'/);
assert.match(fs.readFileSync('app/(tabs)/admin.tsx','utf8'),/ResponsiveColumns/);
console.log(`PASS: ${pages.length} route pages share the compact frame (including delegated modules), notebook rail/wide content, mobile tabs and 44px actions.`);
