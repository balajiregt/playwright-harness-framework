import ts from 'typescript';
import type {Evidence} from './collect.js';
import {digest} from '../context.js';

// Conservative static slice. We retain declarations transitively by referenced name;
// unresolved dynamic dispatch remains reviewable rather than guessed.
export function compactEvidence(e:Evidence,roles?:string[]):Evidence {
 const issues=[...e.issues];
 const bind=(code:string)=>{
  const file=ts.createSourceFile('binding.ts',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const transformed=ts.transform(file,[context=>root=>{
   const visit:ts.Visitor=node=>{
    if(ts.isPropertyAccessExpression(node)&&/^\w+\.project\.metadata\.roles$/.test(node.getText(file))&&roles){
     return ts.factory.createArrayLiteralExpression(roles.map(r=>ts.factory.createStringLiteral(r)));
    }
    if(ts.isPropertyAccessExpression(node)&&/^\w+\.project\.metadata$/.test(node.getText(file)))issues.push('unresolved_project_metadata');
    return ts.visitEachChild(node,visit,context);
   };
   return ts.visitNode(root,visit) as ts.SourceFile;
  }]);
  try{return ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}finally{transformed.dispose();}
 };
 const printer=ts.createPrinter({removeComments:true});
 const parse=(code:string)=>ts.createSourceFile('evidence.ts',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const target=parse(bind(e.code));
 const sources=e.sources.map(s=>({s,sf:parse(bind(s.code.replace(e.code,'')))}));
 const used=new Set<string>();
 function refs(n:ts.Node){
  if(ts.isIdentifier(n))used.add(n.text);
  if(ts.isElementAccessExpression(n)&&ts.isCallExpression(n.parent)&&n.parent.expression===n){
   if(ts.isStringLiteral(n.argumentExpression))used.add(n.argumentExpression.text);
   else issues.push('dynamic_dispatch_requires_review');
  }
  ts.forEachChild(n,refs);
 }
 refs(target);
 const hooks:ts.Node[]=[];
 const declarations:ts.Node[]=[];
 const targetCall=target.statements[0];
 const testRoot=targetCall&&ts.isExpressionStatement(targetCall)&&ts.isCallExpression(targetCall.expression)?targetCall.expression.expression.getText().split('.')[0]:'test';
 function scan(n:ts.Node){
  if(ts.isCallExpression(n)&&/\.(beforeEach|beforeAll|afterEach|afterAll|use)$/.test(n.expression.getText())){hooks.push(n);refs(n);return;}
  if(ts.isCallExpression(n)&&n.expression.getText().split('.')[0]===testRoot&&!n.expression.getText().includes('.describe'))return;
  if(ts.isVariableStatement(n)||ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n)){declarations.push(n);return;}
  // Only descend test suite wrappers, not arbitrary function bodies.
  if(ts.isSourceFile(n)||ts.isExpressionStatement(n)||ts.isCallExpression(n)||ts.isArrowFunction(n)||ts.isFunctionExpression(n)||ts.isBlock(n))ts.forEachChild(n,scan);
 }
 for(const {sf} of sources)scan(sf);
 for(const {sf} of sources)for(const statement of sf.statements){
  if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement)&&!ts.isVariableStatement(statement)&&!ts.isFunctionDeclaration(statement)&&!ts.isClassDeclaration(statement)&&!ts.isInterfaceDeclaration(statement)&&!ts.isTypeAliasDeclaration(statement)&&!ts.isEmptyStatement(statement)){
   const call=ts.isExpressionStatement(statement)&&ts.isCallExpression(statement.expression)?statement.expression:null;
   if(!call||call.expression.getText().split('.')[0]!==testRoot)issues.push('module_initialization_requires_review');
  }
  if(ts.isClassDeclaration(statement)&&statement.heritageClauses?.length)issues.push('inherited_behavior_requires_review');
  if(ts.isImportDeclaration(statement)&&statement.importClause&&!statement.importClause.isTypeOnly){
   if(statement.importClause.name)issues.push('default_import_binding_requires_review');
   const bindings=statement.importClause.namedBindings;
   if(bindings&&ts.isNamespaceImport(bindings))issues.push('namespace_import_binding_requires_review');
   if(bindings&&ts.isNamedImports(bindings)&&bindings.elements.some(x=>x.propertyName))issues.push('aliased_import_binding_requires_review');
  }
 }
 function needed(n:ts.Node){
  if(ts.isVariableStatement(n))return n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&used.has(d.name.text));
  if(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))return !!n.name&&used.has(n.name.text);
  return false;
 }
 function members(n:ts.ClassDeclaration){
  return n.members.filter(m=>!ts.isMethodDeclaration(m)||!ts.isIdentifier(m.name)||used.has(m.name.text));
 }
 let before=-1;
 while(before!==used.size){before=used.size;for(const n of declarations)if(needed(n)){if(ts.isClassDeclaration(n)){for(const m of members(n))refs(m);}else refs(n);}}
 const output=sources.map(({s,sf})=>{
  const nodes=[...declarations.filter(n=>n.getSourceFile()===sf&&needed(n)).map(n=>ts.isClassDeclaration(n)?ts.factory.updateClassDeclaration(n,n.modifiers,n.name,n.typeParameters,n.heritageClauses,members(n)):n),...hooks.filter(n=>n.getSourceFile()===sf)];
  return {...s,code:nodes.map(n=>printer.printNode(ts.EmitHint.Unspecified,n,sf)).join('\n')};
 }).filter(s=>s.code.trim());
 const code=printer.printFile(target).trim();
 if(/\beval\s*\(|\bimport\s*\(|\brequire\s*\(|\b\w+\s*\[\s*\w+\s*\]\s*\(/.test(code+'\n'+output.map(s=>s.code).join('\n')))issues.push('dynamic_dispatch_requires_review');
 return {code,sources:output,issues:[...new Set(issues)],fingerprint:digest(JSON.stringify({original:e.fingerprint,roles:roles??null,code,sources:output.map(s=>s.code)}))};
}
