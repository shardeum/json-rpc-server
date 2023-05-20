import WebSocket from "ws";

type subscription_details = {
  address: string | string[]
  topics: string[]
}
class ClientList {
  private list: Map<string,{ socket:WebSocket.WebSocket, subscription_data: subscription_details }>
  public requestIdBySubscriptionId: Map<string, number>
  private indexedBySocket: Map<WebSocket.WebSocket, Set<string>>

  constructor(){
    this.indexedBySocket = new Map();
    this.list = new Map<string,{ socket:WebSocket.WebSocket, subscription_data: subscription_details }>();
    this.requestIdBySubscriptionId = new Map();
    
    this.set = this.set.bind(this)
    this.getById = this.getById.bind(this)
    this.getBySocket = this.getBySocket.bind(this)
    this.getAll = this.getAll.bind(this)
    this.removeBySocket = this.removeBySocket.bind(this)
    this.removeById = this.removeById.bind(this)
  }

  getAll(){
    return { indexedById: this.list , indexedBySocket: this.indexedBySocket }
  }

  getById(id: string){
    if(!this.list.has(id)){
      return null
    }
    return this.list.get(id);
  }

  getBySocket(socket: WebSocket.WebSocket){
    if(!this.indexedBySocket.has(socket)){
      return null
    }
    return this.indexedBySocket.get(socket);
  }

  set(id: string, socket: WebSocket.WebSocket, subscription_data: subscription_details, rpc_request_id: number){
    this.requestIdBySubscriptionId.set(id, rpc_request_id)
    this.list.set(id, { socket, subscription_data });
    if(this.indexedBySocket.has(socket)){
      this.indexedBySocket?.get(socket)?.add(id)
      return
    }
    this.indexedBySocket.set(socket, new Set([id]));
  }
  removeById(id: string){
    this.requestIdBySubscriptionId.delete(id);
    if(this.list.has(id)){
      const socket = this.list.get(id)?.socket 
      this.indexedBySocket?.get(socket as WebSocket.WebSocket)?.delete(id);
      if(this.indexedBySocket?.get(socket as WebSocket.WebSocket)?.size === 0){
        this.indexedBySocket.delete(socket as WebSocket.WebSocket)
      }
      this.list.delete(id)
    }
  }
  removeBySocket(socket: WebSocket.WebSocket){
    if(!this.indexedBySocket.has(socket))return

    const subscriptions = this.indexedBySocket.get(socket)
    subscriptions?.forEach(el => {
      this.requestIdBySubscriptionId.delete(el);
      this.list.delete(el);
    })

    this.indexedBySocket.delete(socket);

  }
}

export const logSubscriptionList = new ClientList();
