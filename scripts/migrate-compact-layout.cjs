// Mechanical migration: preserve handlers, data and authorization logic.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const write = process.argv.includes('--write');
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):/\.tsx$/.test(e.name)?[path.join(dir,e.name)]:[]); }
let changed=0, groups=0, titles=0;
for(const file of [...walk('app'),...walk('src/components')]) {
  if(/(?:PlayerCard|BrandLogo|AppBrandBar|PageHeading|ui[\\/])/.test(file))continue;
  const code=fs.readFileSync(file,'utf8'), ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), edits=[];
  let headingImport=false;
  const put=(node,text)=>edits.push({start:node.getStart(ast),end:node.end,text});
  function visit(n){
    if(ts.isPropertyAssignment(n)&&/title|heading/i.test(n.name.getText(ast))&&ts.isObjectLiteralExpression(n.initializer)) {
      const props=n.initializer.properties, size=props.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='fontSize');
      if(size&&ts.isNumericLiteral(size.initializer)&&Number(size.initializer.text)>22){
        put(size.initializer,'22');titles++;
        for(const p of props)if(ts.isPropertyAssignment(p)&&p.name.getText(ast)==='fontWeight'&&p.initializer.getText(ast)==="'900'")put(p.initializer,"'800'");
      }
    }
    if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Screen'&&!code.includes('<PageHeading>')) {
      const children=n.children.filter(c=>!(ts.isJsxText(c)&&!c.text.trim()));
      for(let i=0;i<children.length;i++){
        const first=children[i];
        if(!ts.isJsxElement(first)||first.openingElement.tagName.getText(ast)!=='Text'||!/title|heading/i.test(first.openingElement.attributes.getText(ast)))continue;
        const run=[first];let j=i+1;
        while(j<children.length&&run.length<2&&ts.isJsxElement(children[j])&&children[j].openingElement.tagName.getText(ast)==='Text'&&!/title|heading/i.test(children[j].openingElement.attributes.getText(ast))){run.push(children[j]);j++;}
        if(run.length<2)continue;
        edits.push({start:first.getStart(ast),end:run.at(-1).end,text:'<PageHeading>'+code.slice(first.getStart(ast),run.at(-1).end)+'</PageHeading>'});
        groups++;headingImport=true;i=j-1;
      }
    }
    if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='PageHeading'){
      const children=n.children.filter(c=>!(ts.isJsxText(c)&&!c.text.trim()));
      if(children.length>2){
        put(n,'<PageHeading>'+code.slice(children[0].getStart(ast),children[1].end)+'</PageHeading>'+code.slice(children[2].getStart(ast),children.at(-1).end));
      }
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);
  if(!edits.length)continue;
  // The group edits and title-style edits are in disjoint source regions.
  edits.sort((a,b)=>b.start-a.start);
  let out=code;for(const e of edits)out=out.slice(0,e.start)+e.text+out.slice(e.end);
  if(headingImport&&!/import.*PageHeading/.test(code))out="import { PageHeading } from '@/components/ui/PageHeading';\n"+out;
  if(write)fs.writeFileSync(file,out);
  changed++;console.log((write?'Updated ':'Would update ')+file);
}
console.log(JSON.stringify({changed,groups,titles,write}));
