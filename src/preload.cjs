const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('verse', {
  state: () => ipcRenderer.invoke('state'),
  settings: patch => ipcRenderer.invoke('settings', patch),
  action: name => ipcRenderer.invoke('action', name),
  importLyrics: () => ipcRenderer.invoke('import'),
  musicSearch: query => ipcRenderer.invoke('music-search', query),
  musicResolve: (id, song) => ipcRenderer.invoke('music-resolve', id, song),
  musicRecommendations: id => ipcRenderer.invoke('music-recommendations', id),
  musicPlayback: value => ipcRenderer.send('music-playback', value),
  musicCommand: name => ipcRenderer.invoke('music-command', name),
  onMusicCommand: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('music-command', listener); return () => ipcRenderer.removeListener('music-command', listener); },
  onState: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('state', listener); return () => ipcRenderer.removeListener('state', listener); },
  onNavigate: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('navigate', listener); return () => ipcRenderer.removeListener('navigate', listener); }
});
