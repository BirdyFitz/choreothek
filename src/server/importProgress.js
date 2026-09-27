// Fortschritt des laufenden Einlesens (es läuft immer höchstens eins): die Oberfläche fragt ihn
// regelmäßig ab und kann um Abbruch bitten -- abgebrochen wird nach der gerade laufenden Datei.
let state = null;

export function startProgress(kind) {
  if (state) return false;
  state = { kind, done: 0, total: 0, current: null, cancelRequested: false };
  return true;
}

export function reportProgress({ done, total, current }) {
  if (state) Object.assign(state, { done, total, current });
}

export function isCancelRequested() {
  return Boolean(state?.cancelRequested);
}

export function requestCancel() {
  if (state) state.cancelRequested = true;
  return Boolean(state);
}

export function finishProgress() {
  state = null;
}

export function getProgress() {
  return state ? { ...state } : null;
}
