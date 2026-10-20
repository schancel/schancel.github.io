/* Only the shared C++ topology generator runs here. No JavaScript graph generator,
 * transaction workload, PeerManager, fee model or relay protocol is implemented. */
import createModule from './topology.js';

let busy = false;
self.onmessage = async event => {
  const request = event.data;
  if (!request || request.type !== 'generate') return;
  const reply = data => self.postMessage({ ...data, request_id: request.request_id });
  if (busy) { reply({ type: 'error', error: 'This topology Worker is already processing a request.' }); return; }
  busy = true;
  try {
    const config = request.config;
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        !Number.isSafeInteger(config.nodes) || config.nodes < 2 || config.nodes > 1000) {
      throw new Error('Browser topology generation requires 2–1,000 nodes.');
    }
    const serialized = JSON.stringify(config);
    if (serialized.length > 1048576) throw new Error('Topology input exceeds 1 MiB.');
    reply({ type: 'status', message: 'Loading the shared C++ topology generator (WebAssembly)…' });
    const module = await createModule({
      print() {},
      printErr() {},
      onAbort(reason) { throw new Error('Topology WebAssembly aborted: ' + String(reason).slice(0, 1000)); }
    });
    reply({ type: 'status', message: 'Generating C++ topology and graph metrics only; no transactions or relay protocol execute.' });
    const json = module.ccall('relay_topology_run', 'string', ['string'], [serialized]);
    if (typeof json !== 'string' || json.length > 33554432) throw new Error('Topology output is absent or exceeds the 32 MiB worker limit.');
    const result = JSON.parse(json);
    if (result.error) throw new Error(String(result.error));
    if (result.status !== 'topology_only' || !result.config ||
        result.config.nodes !== config.nodes || !Array.isArray(result.topology_outbound_edges) ||
        result.topology_outbound_edges.length > 500000) {
      throw new Error('Unexpected topology-only result or excessive edge count.');
    }
    reply({ type: 'result', result });
  } catch (error) {
    reply({ type: 'error', error: String(error && error.message || error).slice(0, 2000) });
  } finally {
    busy = false;
  }
};
