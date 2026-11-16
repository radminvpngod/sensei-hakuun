const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sensei', {
  send: (ch, ...a) => ipcRenderer.send(ch, ...a),
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  on: (ch, fn) => { const h = (e, ...a) => fn(...a); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); }
});
