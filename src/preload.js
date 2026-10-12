const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('launcher',{
 getSettings:()=>ipcRenderer.invoke('settings:get'),
 getVersion:()=>ipcRenderer.invoke('app:version'),
 inviteStatus:()=>ipcRenderer.invoke('invites:status'),
 createInvite:description=>ipcRenderer.invoke('invites:create',description),
 pickRepo:()=>ipcRenderer.invoke('settings:pickRepo'),
 pickLauncher:()=>ipcRenderer.invoke('settings:pickLauncher'),
 status:()=>ipcRenderer.invoke('server:status'),
 start:()=>ipcRenderer.invoke('server:start'),
 stop:()=>ipcRenderer.invoke('server:stop'),
 restart:()=>ipcRenderer.invoke('server:restart'),
 play:()=>ipcRenderer.invoke('game:play'),
 onActivity:callback=>ipcRenderer.on('activity',(_event,message)=>callback(message))
});
