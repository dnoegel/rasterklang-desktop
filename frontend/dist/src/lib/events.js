// Tiny pub/sub event bus.
export function createEventBus() {
  const map = new Map();

  function on(name, fn) {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
    return () => off(name, fn);
  }

  function off(name, fn) {
    const set = map.get(name);
    if (set) set.delete(fn);
  }

  function emit(name, payload) {
    const set = map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (error) { console.error(`[events] ${name}`, error); }
    }
  }

  function once(name, fn) {
    const stop = on(name, (payload) => {
      stop();
      fn(payload);
    });
    return stop;
  }

  return { on, off, once, emit };
}
