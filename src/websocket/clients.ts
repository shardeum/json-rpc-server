import WebSocket from 'ws'

type subscription_details = {
  address: string | string[]
  topics: string[]
}
/**
 * Represents a list of clients connected to the server.
 */
class ClientList {
  private list: Map<string, { socket: WebSocket.WebSocket; subscription_data: subscription_details }>
  public requestIdBySubscriptionId: Map<string, number>
  private indexedBySocket: Map<WebSocket.WebSocket, Set<string>>

  constructor() {
    this.indexedBySocket = new Map()
    this.list = new Map<string, { socket: WebSocket.WebSocket; subscription_data: subscription_details }>()
    this.requestIdBySubscriptionId = new Map()

    this.set = this.set.bind(this)
    this.getById = this.getById.bind(this)
    this.getBySocket = this.getBySocket.bind(this)
    this.getAll = this.getAll.bind(this)
    this.removeBySocket = this.removeBySocket.bind(this)
    this.removeById = this.removeById.bind(this)
  }

  /**
   * Retrieves all the clients.
   * 
   * @returns An object containing the clients indexed by ID and by socket.
   */
  getAll() {
    return { indexedById: this.list, indexedBySocket: this.indexedBySocket }
  }

  /**
   * Retrieves the client object by its ID.
   * 
   * @param id - The ID of the client.
   * @returns The client object if found, otherwise null.
   */
  getById(id: string) {
    if (!this.list.has(id)) {
      return null
    }
    return this.list.get(id)
  }

  /**
   * Retrieves the client associated with the given WebSocket socket.
   * 
   * @param socket - The WebSocket socket to search for.
   * @returns The client associated with the given socket, or null if not found.
   */
  getBySocket(socket: WebSocket.WebSocket) {
    if (!this.indexedBySocket.has(socket)) {
      return null
    }
    return this.indexedBySocket.get(socket)
  }

  /**
   * Sets the WebSocket connection, subscription details, and RPC request ID for a given ID.
   * 
   * @param id - The ID associated with the subscription.
   * @param socket - The WebSocket connection.
   * @param subscription_data - The subscription details.
   * @param rpc_request_id - The RPC request ID.
   */
  set(
    id: string,
    socket: WebSocket.WebSocket,
    subscription_data: subscription_details,
    rpc_request_id: number
  ) {
    this.requestIdBySubscriptionId.set(id, rpc_request_id)
    this.list.set(id, { socket, subscription_data })
    if (this.indexedBySocket.has(socket)) {
      this.indexedBySocket?.get(socket)?.add(id)
      return
    }
    this.indexedBySocket.set(socket, new Set([id]))
  }
  /**
   * Removes a client by its ID.
   * @param id The ID of the client to remove.
   */
  removeById(id: string) {
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
  /**
   * Removes the subscriptions and associated data for a given WebSocket connection.
   * @param socket The WebSocket connection to remove.
   */
  removeBySocket(socket: WebSocket.WebSocket) {
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
