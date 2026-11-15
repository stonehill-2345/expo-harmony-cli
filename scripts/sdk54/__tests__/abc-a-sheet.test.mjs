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
  const context = { SheetSize:{ FIT_CONTENT:'fit' }, SheetType:{BOTTOM:'bottom'}, DismissReason:{TOUCH_OUTSIDE:1},
    display:{getDefaultDisplaySync:()=>({height:2400})},
    window:{getLastWindow:async()=>({getWindowProperties:()=>({windowRect:{height}})})}, setTimeout:fn=>fn() };
  vm.runInNewContext(code+'; globalThis.RNSScreen = Screen;', context);
  const s = new context.Screen();
  Object.assign(s, {descriptor:{rawProps:props}, stackPresentationMode:'formSheet', sheetVisible:false, gestureEnabled:true,
    tag:20,pageId:'sheet',viewTagArr:[],ctx:{uiAbilityContext:{},rnInstance:{postTouchEventMessageToCpp:(...args)=>events.push(['touch',...args])}}, eventEmitter:{emit:(...args)=>events.push(JSON.parse(JSON.stringify(args)))}, getPreventFlag:()=>false,
    backBtnPressed:()=>events.push(['back']), dismissCount:1, preventNativeDismiss:false });
  context.Screen.TOP_PAGEID_ARR=['parent','sheet'];context.Screen.TOP_PAGE_TAG_MAP=new Map([['parent',10],['sheet',20]]);
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
  s.sheetOptions().onWillDismiss({reason:0,dismiss:()=>events.push(['dismiss'])});assert.equal(s.sheetVisible,true);if(guard==='gestureEnabled')assert.equal(events.length,0);else {assert.equal(events[0]?.[0],'nativeDismissCancelled');assert.equal(events[0]?.[1].dismissCount,1);}
});
test('undimmed outside presses do not dismiss; dimmed outside presses do',()=>{
  const {s,events}=screen({sheetAllowedDetents:[.35,.75],sheetLargestUndimmedDetent:0});s.readSheetProps();s.sheetVisible=true;
  s.sheetOptions().onWillDismiss({reason:1,dismiss:()=>events.push(['dismiss'])});assert.equal(s.sheetVisible,true);assert.deepEqual(events,[]);
  s.sheetDetentIndex=1;s.sheetOptions().onWillDismiss({reason:1,dismiss:()=>events.push(['dismiss'])});assert.equal(s.sheetVisible,false);assert.deepEqual(events,[['willDisappear',{}],['dismiss']]);
});
test('undimmed outside touch forwards to the previous navigation screen tag',()=>{
  const {s,events}=screen({sheetAllowedDetents:[.35,.75],sheetLargestUndimmedDetent:0});s.readSheetProps();s.sheetVisible=true;
  const outside={touches:[{windowY:500}]};s.forwardUndimmedOutsideTouch(outside);
  assert.equal(events.length,1);assert.equal(events[0][0],'touch');assert.equal(events[0][1],10);assert.equal(events[0][2],outside);
  events.length=0;s.forwardUndimmedOutsideTouch({touches:[{windowY:2000}]});assert.deepEqual(events,[]);
  s.sheetDetentIndex=1;s.forwardUndimmedOutsideTouch(outside);assert.deepEqual(events,[]);
});
test('native dismissal keeps the route until the actual sheet disappearance and pops once',()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;
  const action={dismiss:()=>events.push(['dismiss'])};
  s.sheetOptions().onWillDismiss({reason:0,...action});s.sheetOptions().onWillDismiss({reason:0,...action});
  assert.equal(s.sheetVisible,false);
  assert.deepEqual(events,[['willDisappear',{}],['dismiss']]);
  s.sheetOptions().onDisappear();s.sheetOptions().onDisappear();
  assert.deepEqual(events,[['willDisappear',{}],['dismiss'],['disappear',{}],['back']]);
});
test('programmatic removal emits closing lifecycle exactly once',()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;
  s.emitSheetWillDisappear();s.emitSheetWillDisappear();s.emitSheetDisappear();s.emitSheetDisappear();
  assert.deepEqual(events,[['willDisappear',{}],['disappear',{}]]);
});
test('programmatic sheet close ignores the gesture guard but preserves native prevention',()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;s.gestureEnabled=false;
  s.dismissSheet(false);assert.equal(s.sheetVisible,false);
  assert.deepEqual(events,[['willDisappear',{}]]);
  s.sheetOptions().onDisappear();assert.deepEqual(events,[['willDisappear',{}],['disappear',{}],['back']]);
  s.sheetVisible=true;s.preventNativeDismiss=true;events.length=0;
  s.dismissSheet(false);assert.equal(s.sheetVisible,true);assert.equal(events[0][0],'nativeDismissCancelled');
});
test('system Back is consumed for a guarded sheet and ordinary screens retain their handler',()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;s.gestureEnabled=false;
  assert.equal(s.handleSheetBack(),true);assert.equal(s.sheetVisible,true);assert.equal(events.length,0);
  s.gestureEnabled=true;assert.equal(s.handleSheetBack(),true);assert.equal(s.sheetVisible,false);
  s.sheetOptions().onDisappear();assert.equal(events.at(-1)[0],'back');
  s.stackPresentationMode='push';assert.equal(s.handleSheetBack(),false);
});

// Execute the emitted native back callback prefix. A native Stack must not pop
// before the existing JS BackHandler has offered the event to a nested Drawer.
const backPrefix = execFileSync('python3', ['-c', `import ast
p=ast.parse(open('packages/expo-modules-autolinking/scripts/harmony/prepare-screens.py').read())
print(next(n.args[1].value for n in ast.walk(p) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='replace' and len(n.args)>1 and isinstance(n.args[0],ast.Constant) and n.args[0].value=='      .onBackPressed(() => {'))`], {encoding:'utf8'}).replace('      .onBackPressed(() => {','');
function pressNativeBack(s, events) {
  return new Function('RNSScreen','nativePop',backPrefix+'\nnativePop(); return true;').call(s,s.constructor,()=>events.push(['native-pop']));
}
test('top native screen offers back to JS so nested Drawer consumes before parent Stack',()=>{
  const {s,events}=screen();s.stackPresentationMode='push';s.pageId='drawer';s.constructor.TOP_PAGEID='drawer';
  let route='second';
  s.ctx.rnInstance.emitDeviceEvent=(name,payload)=>{events.push([name,payload]);route='index';};
  assert.equal(pressNativeBack(s,events),true);
  assert.equal(route,'index','Native back must reach the existing nested JS navigator');
  assert.equal(events.length,1);assert.equal(events[0][0],'hardwareBackPress');
});
test('root JS back has a chance to invoke the existing default exit fallback',()=>{
  const {s,events}=screen();s.stackPresentationMode='push';s.pageId='root';s.constructor.TOP_PAGEID='root';
  s.ctx.rnInstance.emitDeviceEvent=(name)=>{assert.equal(name,'hardwareBackPress');events.push(['default-exit']);};
  pressNativeBack(s,events);assert.deepEqual(events,[['default-exit']]);
});
test('non-top native screen keeps the original native callback without emitting JS back',()=>{
  const {s,events}=screen();s.stackPresentationMode='push';s.pageId='covered';s.constructor.TOP_PAGEID='top';
  s.ctx.rnInstance.emitDeviceEvent=()=>events.push(['unexpected-js-back']);
  pressNativeBack(s,events);assert.deepEqual(events,[['native-pop']]);
});
test('native Sheet guard consumes back without delivering a second JS pop',()=>{
  const {s,events}=screen();s.readSheetProps();s.sheetVisible=true;s.gestureEnabled=false;s.constructor.TOP_PAGEID=s.pageId;
  s.ctx.rnInstance.emitDeviceEvent=()=>events.push(['unexpected-js-back']);
  pressNativeBack(s,events);assert.equal(s.sheetVisible,true);assert.deepEqual(events,[]);
});
