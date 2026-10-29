'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.resolve(__dirname,'../../assets/css/client-folder-board.css'),'utf8');
function rule(selector){const start=css.indexOf(selector+'{');assert.ok(start>=0,selector);return css.slice(start+selector.length+1,css.indexOf('}',start));}
test('mobile directory fills the scaled shell through flex sizing instead of viewport-height row caps',()=>{
 assert.match(rule('body.mobile-client-ui #mainContent:has(>#clientFolderBoard)'),/display:flex;flex-direction:column;min-height:0;overflow:hidden/);
 assert.match(rule('body.mobile-client-ui #clientFolderBoard'),/flex:1 1 0;min-height:0/);
 assert.match(rule('body.mobile-client-ui #clientFolderBoard>.cfb-columns'),/flex:1 1 0;min-height:0;align-items:stretch/);
 assert.match(rule('body.mobile-client-ui #clientFolderBoard .cfb-column'),/display:flex;flex-direction:column;min-height:0/);
 assert.match(rule('body.mobile-client-ui #clientFolderBoard .cfb-rows'),/flex:1 1 0;min-height:0;max-height:none/);
});
test('mobile headings stay above scrollable rows, touch gestures remain native and desktop limits remain unchanged',()=>{
 assert.match(rule('body.mobile-client-ui #clientFolderBoard .cfb-column-head'),/flex-shrink:0/);
 assert.match(rule('body.mobile-client-ui #clientFolderBoard .cfb-rows'),/touch-action:pan-x pan-y pinch-zoom/);
 assert.match(css,/\.cfb-rows\{max-height:calc\(100dvh - 245px\);min-height:95px;overflow-y:auto/);
 assert.doesNotMatch(rule('body.mobile-client-ui #clientFolderBoard .cfb-rows'),/100d?vh/);
});
test('mobile height subtracts the actual flex header rather than assuming its default size',()=>{
 assert.match(rule('body.mobile-client-ui:has(#clientFolderBoard) #mainApp'),/display:flex!important/);
 assert.match(rule('body.mobile-client-ui:has(#clientFolderBoard) #mainApp'),/height:calc\(var\(--mobile-visual-height,100dvh\) \/ var\(--mobile-shell-scale,1\)\)/);
 assert.match(rule('body.mobile-client-ui:has(#clientFolderBoard) #mainApp>header'),/flex-shrink:0/);
 assert.match(rule('body.mobile-client-ui:has(#clientFolderBoard) #mainApp>.layout'),/flex:1 1 0;height:auto!important;min-height:0!important/);
});
