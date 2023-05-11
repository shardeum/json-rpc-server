export enum FilterTypes {
  log,
  block,
  pendingTransaction
}
export type Topic = string | string[];
export type BaseFilterArgs = { addresses: string[]; topics: Topic[] };
export type Filter = BaseFilterArgs & {
  fromBlock?: string;
  toBlock?: string;
  lastQuriedTimestamp: number;
  lastQueriedBlock: number;
};
export type InternalFilter = {
  type: FilterTypes;
  updates: any[];
  unsubscribe: Function;
  filter: Filter;
};
