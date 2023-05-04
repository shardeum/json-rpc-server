import WebSocket from "ws";

class ClientList {
  list: Map<string,WebSocket.WebSocket>

  constructor(){
    this.list = new Map<string,WebSocket.WebSocket>();
    this.addNewClient = this.addNewClient.bind(this);
  }
  addNewClient(id: string, connection: WebSocket.WebSocket){
    this.list.set(id, connection);
  }
  pruneClient(id: string){
    if(this.list.has(id)) this.list.delete(id);
  }
  reset(){
    this.list = new Map<string,WebSocket.WebSocket>();
  }
}

export const logSubscriptionList = new ClientList();
