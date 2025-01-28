export interface IpData {
  ip: string
  count: number
}

export interface FromData {
  from: string
  count: number
  ips: Record<string, IpData>
}

export interface ToData {
  to: string
  count: number
  from: Record<string, FromData>
}

export interface RpcRequest {
  method: string
  params: any[]
}

export interface BlacklistData {
  ip: string
  timestamp: number
}

export interface RequestTracker {
  [key: string]: IpData
}

export interface AbusedSender {
  address: string
  count: number
}
