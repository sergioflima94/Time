// The browser accepts raw text inside a div; native layout containers do not.
// Keep this check independent of a browser so web-only tests cannot hide it.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

const layoutTags = new Set(['View', 'Animated.View', 'ScrollView', 'SafeAreaView',
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'KeyboardAvoidingView',
  'GestureHandlerRootView', 'Screen', 'Card']);

function rawTextIssues(source, file = 'fixture.tsx') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = [];
  function visit(node) {
    if (ts.isJsxElement(node) && layoutTags.has(node.openingElement.tagName.getText(ast))) {
      const tag = node.openingElement.tagName.getText(ast);
      function inspect(child) {
        if (ts.isJsxFragment(child)) return child.children.forEach(inspect);
        // Newlines used to indent JSX disappear; explicit string expressions,
        // including {" "}, create an RCTRawText node even in production.
        const raw = ts.isJsxText(child) ? (/\r|\n/.test(child.text) ? child.text.trim() : child.text)
          : ts.isJsxExpression(child) && child.expression &&
            (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression))
            ? child.expression.text : null;
        if (raw) {
          const pos = ast.getLineAndCharacterOfPosition(child.getStart(ast));
          issues.push(`${file}:${pos.line + 1}: raw text inside ${tag}`);
        }
      }
      node.children.forEach(inspect);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return issues;
}

assert.equal(rawTextIssues('<View><Text>ok</Text>{" "}<Button /></View>').length, 1);
assert.equal(rawTextIssues('<View><><Text>ok</Text>{" "}</></View>').length, 1);
assert.equal(rawTextIssues('<View> <Text>ok</Text></View>').length, 1);
assert.equal(rawTextIssues('<View>\n <Text>hello {" "}world</Text>\n</View>').length, 0);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.tsx') ? [file] : [];
  });
}
const issues = [...files('app'), ...files('src')].flatMap(file => rawTextIssues(fs.readFileSync(file, 'utf8'), file));
assert.deepEqual(issues, [], 'Raw text must be inside Text, not native layout containers');
console.log('PASS: no raw JSX text in native layout containers across app/ and src/.');
