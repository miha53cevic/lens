// The app's own pages get `window.lensApp`: a fixed list of calls to the main process, and nothing
// from Node or Electron itself. The viewer is loaded without this script.

import { contextBridge, ipcRenderer } from 'electron';
import { LAUNCHER_CALLS, STRIP_CALLS, type LensAppApi } from './shared/api.ts';

function area<Api>(name: 'strip' | 'launcher', calls: readonly string[]): Api {
  const api: Record<string, unknown> = {
    state: () => ipcRenderer.invoke(name + ':state'),
    onState: (listener: (state: unknown) => void) => {
      ipcRenderer.on(name + ':changed', (_event, state) => listener(state));
    },
  };
  for (const call of calls) {
    api[call] = (...args: unknown[]) => ipcRenderer.send(name + ':' + call, ...args);
  }
  return api as Api;
}

const api: LensAppApi = {
  strip: area('strip', STRIP_CALLS),
  launcher: area('launcher', LAUNCHER_CALLS),
};
contextBridge.exposeInMainWorld('lensApp', api);
