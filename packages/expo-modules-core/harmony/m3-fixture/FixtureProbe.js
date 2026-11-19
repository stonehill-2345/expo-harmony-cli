const React = require('react');
const { ScrollView, Text, TurboModuleRegistry } = require('react-native');
const { requireNativeModule, requireNativeViewManager, reloadAppAsync } = require('expo-modules-core');
TurboModuleRegistry.getEnforcing('ExpoM3AuthorFixture').installModule();
const native = requireNativeModule('ExpoM3AuthorFixture');
const NativeView = requireNativeViewManager('ExpoM3AuthorFixture', 'Named');
console.log('M3_JS_BUILD=m3-review-20261028-v2');
const boot = Date.now();
console.log('M3_BOOT=' + boot);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(value, message) { if (!value) throw new Error(message); }
async function waitFor(body) {
  const deadline = Date.now() + 5000;
  while (!body()) { check(Date.now() < deadline, 'Native view timed out'); await pause(20); }
}
module.exports = function FixtureProbe() {
  const view = React.useRef(null);
  const events = React.useRef([]);
  const [visible, setVisible] = React.useState(true);
  const [label, setLabel] = React.useState('m3-initial');
  const [results, setResults] = React.useState([]);
  React.useEffect(() => {
    let disposed = false;
    const rows = [];
    const run = async (name, body) => {
      try { await body(); rows.push({ name, passed: true }); }
      catch (error) { rows.push({ name, passed: false, detail: String(error) }); }
    };
    (async () => {
      await run('sync.value', () => check(native.sum(2, 3) === 5, 'Wrong sync value'));
      await run('sync.error', () => { let threw = false; try { native.sum('x', 1); } catch { threw = true; } check(threw, 'Missing sync exception'); });
      await run('numeric.nonfinite', () => {
        for (const value of [NaN, Infinity, -Infinity]) {
          for (const action of [() => native.sum(value, 1), () => native.sum(1, value),
            () => native.emitValue(value), () => native.createResource(value), () => native.createRef(value),
            () => native.workAsync(value, 0, false), () => native.workAsync(1, value, false)]) {
            let threw = false; try { action(); } catch { threw = true; }
            check(threw, 'Non-finite number accepted: ' + value);
          }
        }
      });
      await run('async.resolve', async () => check(await native.workAsync(7, 10, false) === 7, 'Wrong async result'));
      await run('async.reject', async () => {
        let error; try { await native.failWithCodeAsync(); } catch (e) { error = e; }
        check(error && error.code === 'ERR_CORE_ASYNC_PROBE', 'Lost native error code');
      });
      await run('event.unsubscribe', () => {
        const values = []; const subscription = native.addListener('value', value => values.push(value));
        native.emitValue(1); subscription.remove(); subscription.remove(); native.emitValue(2);
        check(values.length === 1 && values[0] === 1, 'Event subscription was not revoked');
      });
      await run('shared.release', () => {
        const object = native.createResource(9); check(object.getValue() === 9, 'Wrong shared resource');
        object.release(); let threw = false; try { object.getValue(); } catch { threw = true; }
        check(threw && native.resourcesAlive() === 0, 'Released resource still accessible');
      });
      await run('shared.ref', () => {
        const ref = native.createRef(10);
        check(ref instanceof globalThis.expo.SharedRef && ref.getValue() === 10, 'Wrong shared ref');
        ref.release();
        let threw = false; try { ref.getValue(); } catch { threw = true; }
        check(threw && native.resourcesAlive() === 0, 'Released ref still accessible');
      });
      await run('view.props-event-ref', async () => {
        await waitFor(() => view.current && events.current.includes('m3-initial'));
        for (const value of [NaN, Infinity, -Infinity]) {
          let threw = false; try { view.current.getTextAsync(value); } catch { threw = true; }
          check(threw, 'Non-finite view delay accepted: ' + value);
        }
        setLabel('m3-prop'); await waitFor(() => events.current.includes('m3-prop'));
        check(await view.current.getTextAsync(0) === 'm3-prop', 'ArkUI prop not applied');
        view.current.setText('m3-command'); await waitFor(() => events.current.includes('m3-command'));
        check(await view.current.getTextAsync(0) === 'm3-command', 'ArkUI command not applied');
      });
      let retired;
      await run('view.unmount', async () => {
        check(view.current, 'No mounted native view'); retired = view.current;
        const pending = retired.getTextAsync(300).then(() => null, error => error);
        setVisible(false); await waitFor(() => view.current === null);
        check(retired.nativeTag === null, 'Unmount retained native tag');
        const error = await pending;
        check(error && error.code === 'ERR_VIEW_UNMOUNTED', 'Late view read must reject');
      });
      await run('view.remount-stale-ref', async () => {
        check(retired, 'Missing retired view'); setLabel('m3-replacement'); setVisible(true);
        await waitFor(() => view.current && events.current.includes('m3-replacement'));
        retired.nativeTag = view.current.nativeTag;
        let threw = false; try { await retired.getTextAsync(0); } catch { threw = true; }
        retired.nativeTag = null;
        check(threw && await view.current.getTextAsync(0) === 'm3-replacement', 'Old binding accessed replacement view');
      });
      if (disposed) return;
      setResults(rows); console.log('M3_RESULTS=' + JSON.stringify(rows));
      if (rows.some(row => !row.passed)) return;
      const constants = native;
      // File-system persistence survives a real RN runtime reload.
      const marker = TurboModuleRegistry.getEnforcing('M3ReloadMarker');
      if (marker.consumePending()) {
        const nextResource = native.createResource(42);
        check(nextResource.getValue() === 42, 'New runtime resource unavailable');
        console.log('M3_RESOURCE_NEW=' + nextResource.probeId);
        nextResource.release();
        console.log('M3_RELOAD_OBSERVED=' + boot);
        await pause(2300);
        console.log('M3_QUIET_WINDOW=' + boot);
        return;
      }
      marker.setPending();
      globalThis.__m3HeldResource = native.createResource(41);
      check(globalThis.__m3HeldResource.getValue() === 41, 'Old runtime resource unavailable');
      console.log('M3_RESOURCE_HELD=' + globalThis.__m3HeldResource.probeId);
      const stale = () => console.error('M3_STALE_CALLBACK=' + boot);
      constants.workAsync(3, 1800, false).then(stale, stale);
      view.current.getTextAsync(1000).then(stale, stale);
      console.log('M3_RELOAD_PENDING=' + boot);
      await reloadAppAsync('M3 author runtime teardown probe');
    })().catch(error => console.error('M3_FAILURE=' + String(error)));
    return () => { disposed = true; };
  }, []);
  return React.createElement(ScrollView, null,
    React.createElement(Text, null, 'M3 Author Fixture'),
    visible ? React.createElement(NativeView, { ref: view, label, style: { height: 48 }, onValue: event => events.current.push(event.nativeEvent.value) }) : null,
    ...results.map(row => React.createElement(Text, { key: row.name }, row.name + ': ' + (row.passed ? 'PASS' : row.detail))));
};
