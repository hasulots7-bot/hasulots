// Narrow, safe bridge between the QuickPrint website (admin page) and the desktop app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qpDesktop', {
  isDesktop: true,
  version: ipcRenderer.sendSync('qp:version'),
  getPrinters: () => ipcRenderer.invoke('qp:printers'),
  // job: { url:'/uploads/..', printer, copies, colorMode, duplex, paperSize, pageRange }
  printFile: (job) => ipcRenderer.invoke('qp:print', job),
  retry: () => ipcRenderer.send('qp:retry')
});
