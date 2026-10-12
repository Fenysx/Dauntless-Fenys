const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('launcher',{
 getSettings:()=>ipcRenderer.invoke('settings:get'),
 pickRepo:()=>ipcRenderer.invoke('settings:pickRepo'),
 pickLauncher:()=>ipcRenderer.invoke('settings:pickLauncher'),
 status:()=>ipcRenderer.invoke('server:status'),
 start:()=>ipcRenderer.invoke('server:start'),
 stop:()=>ipcRenderer.invoke('server:stop'),
 restart:()=>ipcRenderer.invoke('server:restart'),
 play:()=>ipcRenderer.invoke('game:play'),
 onActivity:callback=>ipcRenderer.on('activity',(_event,message)=>callback(message))
});
