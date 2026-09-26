const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  buscarServidor: () => ipcRenderer.invoke('buscar'),
  conectar: (url) => ipcRenderer.invoke('conectar', url),
  probar: (ip) => ipcRenderer.invoke('probar', ip),
  ultimo: () => ipcRenderer.invoke('ultimo'),
  elegirModo: (modo) => ipcRenderer.invoke('elegir-modo', modo),
  cambiarModo: () => ipcRenderer.invoke('cambiar-modo'),
});
