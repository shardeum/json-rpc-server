import WebSocket from 'ws'

export type SubscriptionDetails = {
  address: string | string[]
  topics: string[]
}
class ClientList {
  private list: Map<string, { socket: WebSocket.WebSocket; subscription_data: SubscriptionDetails }>
  public requestIdBySubscriptionId: Map<string, number>
  private indexedBySocket: Map<WebSocket.WebSocket, Set<string>>

  constructor() {
    this.indexedBySocket = new Map()
    this.list = new Map<string, { socket: WebSocket.WebSocket; subscription_data: SubscriptionDetails }>()
    this.requestIdBySubscriptionId = new Map()

    this.set = this.set.bind(this)
    this.getById = this.getById.bind(this)
    this.getBySocket = this.getBySocket.bind(this)
    this.getAll = this.getAll.bind(this)
    this.removeBySocket = this.removeBySocket.bind(this)
    this.removeById = this.removeById.bind(this)
  }

  getAll(): {
    indexedById: Map<string, { socket: WebSocket.WebSocket; subscription_data: SubscriptionDetails }>
    indexedBySocket: Map<WebSocket.WebSocket, Set<string>>
  } {
    return { indexedById: this.list, indexedBySocket: this.indexedBySocket }
  }

  getById(id: string): { socket: WebSocket.WebSocket; subscription_data: SubscriptionDetails } | null {
    if (!this.list.has(id)) {
      return null
    }
    return this.list.get(id) ?? null
  }

  getBySocket(socket: WebSocket.WebSocket): Set<string> | null {
    if (!this.indexedBySocket.has(socket)) {
      return null
    }
    return this.indexedBySocket.get(socket) ?? null
  }

  set(
    id: string,
    socket: WebSocket.WebSocket,
    subscription_data: SubscriptionDetails,
    rpc_request_id: number
  ): void {
    this.requestIdBySubscriptionId.set(id, rpc_request_id)
    this.list.set(id, { socket, subscription_data })
    if (this.indexedBySocket.has(socket)) {
      this.indexedBySocket?.get(socket)?.add(id)
      return
    }
    this.indexedBySocket.set(socket, new Set([id]))
  }
  removeById(id: string): void {
    this.requestIdBySubscriptionId.delete(id)
    if (this.list.has(id)) {
      const socket = this.list.get(id)?.socket
      this.indexedBySocket?.get(socket as WebSocket.WebSocket)?.delete(id)
      if (this.indexedBySocket?.get(socket as WebSocket.WebSocket)?.size === 0) {
        this.indexedBySocket.delete(socket as WebSocket.WebSocket)
      }
      this.list.delete(id)
    }
  }
  removeBySocket(socket: WebSocket.WebSocket): void {
    if (!this.indexedBySocket.has(socket)) return

    const subscriptions = this.indexedBySocket.get(socket)
    subscriptions?.forEach((el) => {
      this.requestIdBySubscriptionId.delete(el)
      this.list.delete(el)
    })

    this.indexedBySocket.delete(socket)
  }
}

export const logSubscriptionList = new ClientList()
