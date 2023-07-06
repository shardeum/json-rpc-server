export enum FilterTypes {
  log,
  block,
  pendingTransaction
}
export type Topic = string | string[];
export type BaseFilterArgs = { address: string; topics: Topic[] };
export type Filter = BaseFilterArgs & {
  fromBlock?: string;
  toBlock?: string;
  lastQueriedTimestamp: number;
  lastQueriedBlock: number;
  createdBlock: number;
};
export type InternalFilter = {
  type: FilterTypes;
  updates: any[];
  unsubscribe: Function;
  filter: Filter;
};
