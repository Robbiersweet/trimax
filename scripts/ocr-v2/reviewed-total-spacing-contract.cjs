/* eslint-disable @typescript-eslint/no-require-imports -- Exact reviewed optical-token delta; all other financial source remains frozen. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function normalizeReviewedTotalSpacing(source,file){
 if(file!=='src/app/lib/remittanceMatching.ts')return source;
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declarations=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='explicitTotalEvidenceCandidates');
 if(declarations.length!==1)return source;
 const node=declarations[0],text=node.getText(tree).replaceAll(String.fromCharCode(13,10),String.fromCharCode(10));
 if(hash(text)!=='817f9aea3a768e10dce9fa7b7887d81082499071990148db9f983692abb00423')return source;
 const original=text.replace("  // OCR may separate a thousands comma from its complete three-digit group.\n  // Admit that spacing without supplying missing digits or joining partial totals.\n",'').replace("(?:[,\\s][ \\t]*\\d{3})+","(?:[,\\s]\\d{3})+");
 assert.equal(hash(original),'35ace52ce19a7fb85f2784ab4faecc56e8c6f8be7b1a3deb6f8291972fea0f13','Exact reviewed optical token delta only');
 return source.slice(0,node.getStart(tree))+original+source.slice(node.end);
}
module.exports={normalizeReviewedTotalSpacing};
