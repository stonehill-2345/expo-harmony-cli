import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

// Execute the actual method block emitted by the Python transformer, not a second implementation.
const methods = execFileSync('python3', ['-c', `import ast
p=ast.parse(open('packages/expo-modules-autolinking/scripts/harmony/prepare-screens.py').read())
print(next(n.value for n in ast.walk(p) if isinstance(n,ast.Constant) and isinstance(n.value,str) and 'private isFormSheet()' in n.value).split('@Builder')[0])`], { encoding: 'utf8' });
function screen(props = {}) {
  let height = 1000;
  const events = [];
  const code = ts.transpileModule(`class Screen { ${methods} }; globalThis.Screen = Screen;`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const context = { SheetSize:{ FIT_CONTENT:'fit' }, SheetType:{BOTTOM:'bottom'},
    display:{getDefaultDisplaySync:()=>({height:2400})},
    window:{getLastWindow:async()=>({getWindowProperties:()=>({windowRect:{height}})})} };
  vm.runInNewContext(code, context);
  const s = new context.Screen();
  Object.assign(s, {descriptor:{rawProps:props}, stackPresentationMode:'formSheet', sheetVisible:false, gestureEnabled:true,
    ctx:{uiAbilityContext:{}}, eventEmitter:{emit:(...args)=>events.push(args)}, getPreventFlag:()=>false,
    backBtnPressed:()=>events.push(['back']), dismissCount:1, preventNativeDismiss:false });
  return {s, events, resize(value){height=value;}};
}
for (const detents of [[1],[.35,.75],[.2,.5,.9],[-1]]) for (let initial=0; initial<detents.length; initial++) {
  test(`sheet initializes ${JSON.stringify(detents)} at ${initial}`, () => {
    const {s} = screen({sheetAllowedDetents:detents,sheetInitialDetent:initial}); s.readSheetProps();
    assert.equal(s.sheetOptions().detents[0],detents[initial]===-1?'fit':`${detents[initial]*100}%`);
    assert.equal(s.sheetDetentIndex,initial);
  });
}
for (const detents of [[],[NaN],[0],[-.2],[1.1],[.1,.2,.3,.4],[-1,.5],[.8,.3]]) {
  test(`rejects invalid detents ${String(detents)}`,()=>{const {s}=screen({sheetAllowedDetents:detents}); assert.throws(()=>s.readSheetProps());});
}
for(const key of ['sheetInitialDetent','sheetLargestUndimmedDetent']) for(const value of [NaN,.5,-2,3]) {
  test(`rejects ${key}=${value}`,()=>{const {s}=screen({sheetAllowedDetents:[.2,.5,.9],[key]:value});assert.throws(()=>s.readSheetProps());});
}
test('uses current window pixels after orientation change and stable original indices',async()=>{
  const {s,events,resize}=screen({sheetAllowedDetents:[.2,.5,.9],sheetInitialDetent:2}); s.readSheetProps();s.sheetVisible=true;
  await s.sheetOptions().onDetentsDidChange(500); assert.equal(s.sheetDetentIndex,1);
  resize(600);await s.sheetOptions().onDetentsDidChange(540);assert.equal(s.sheetDetentIndex,2);
  assert.equal(events[1][1].isStable,true);
});
test('ignores queued detent callbacks after sheet removal',async()=>{
  const {s,events}=screen(); s.readSheetProps(); await s.sheetOptions().onDetentsDidChange(1000);assert.equal(events.length,0);
});
test('grabber, undimming, corner radius and elevation reach ArkUI options',()=>{
  const {s}=screen({sheetAllowedDetents:[.35,.75],sheetLargestUndimmedDetent:0,sheetGrabberVisible:true,sheetCornerRadius:18,sheetElevation:12});
  s.readSheetProps();let options=s.sheetOptions();assert.equal(options.dragBar,true);assert.equal(options.enableOutsideInteractive,true);
  assert.equal(options.radius.topLeft,18);assert.equal(options.shadow.radius,12);
  s.sheetDetentIndex=1;assert.equal(s.sheetOptions().enableOutsideInteractive,false);
});
test('negative corner radius uses system default; zero elevation removes shadow',()=>{
  const {s}=screen({sheetCornerRadius:-1,sheetElevation:0});s.readSheetProps();assert.equal(s.sheetOptions().radius,undefined);assert.equal(s.sheetOptions().shadow.radius,0);
});
for(const props of [{sheetCornerRadius:NaN},{sheetElevation:-1},{sheetElevation:1.5}]) test(`rejects invalid appearance ${JSON.stringify(props)}`,()=>{const {s}=screen(props);assert.throws(()=>s.readSheetProps());});
for(const guard of ['preventNativeDismiss','gestureEnabled','parent']) test(`dismiss guard ${guard} preserves route and sheet`,()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;
  if(guard==='parent') s.getPreventFlag=()=>true;else s[guard]=guard==='preventNativeDismiss';
  s.sheetOptions().shouldDismiss({dismiss:()=>events.push(['dismiss'])});assert.equal(s.sheetVisible,true);if(guard==='gestureEnabled')assert.equal(events.length,0);else {assert.equal(events[0]?.[0],'nativeDismissCancelled');assert.equal(events[0]?.[1].dismissCount,1);}
});
test('allowed native dismissal pops once',()=>{const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;const action={dismiss:()=>events.push(['dismiss'])};s.sheetOptions().shouldDismiss(action);s.sheetOptions().shouldDismiss(action);assert.equal(s.sheetVisible,false);assert.deepEqual(events,[['dismiss'],['back']]);});
