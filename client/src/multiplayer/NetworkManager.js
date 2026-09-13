import { io } from 'socket.io-client';
export class NetworkManager {
  constructor(callbacks){
    this.id=null;this.callbacks=callbacks;this.socket=io({auth:cb=>cb({token:sessionStorage.getItem('turborush-token')})});
    this.socket.on('identity',data=>{this.id=data.id;sessionStorage.setItem('turborush-token',data.token);});
    this.socket.on('connect',()=>callbacks.connection(true));this.socket.on('disconnect',()=>callbacks.connection(false));this.socket.on('connect_error',()=>callbacks.connection(false));
    this.socket.on('room',room=>callbacks.room(room));this.socket.on('snapshot',snapshot=>callbacks.snapshot(snapshot));
  }
  action(event,data={}){return new Promise((resolve,reject)=>{if(!this.socket.connected)return reject(Error('The race server is offline. Quick Race still works.'));this.socket.timeout(5000).emit(event,data,(err,response)=>{if(err)reject(Error('The server did not respond. Please try again.'));else if(response?.error)reject(Error(response.error));else resolve(response);});});}
  input(input){if(this.socket.connected)this.socket.volatile.emit('input',input);}
}
