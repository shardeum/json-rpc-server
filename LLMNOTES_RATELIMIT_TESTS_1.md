## Rate Limit Test Coverage Improvements Needed

### RequestersList Class Coverage Gaps
1. `addHeavyAddress` method - needs tests for address tracking
2. `addAbusedSender` method - needs tests for sender abuse tracking
3. `addAbusedAddress` method - needs tests for contract abuse tracking
4. `checkFaucetAccount` method - needs tests for faucet account validation
5. `isQueryType` method - needs tests for query type validation
6. Edge cases in `isRequestOkay` method

### Utils.ts Coverage Gaps
1. `getTransactionObj` function - needs tests for different transaction types
2. `writeToBlacklist` and `writeToSpammerList` functions - needs error handling tests
3. `writeNewBlacklistWithRetry` function - needs retry logic tests

### Edge Cases to Test
1. Whitelist functionality
2. Multiple IP addresses hitting rate limits simultaneously
3. Transaction validation with different formats
4. Error handling in file operations
5. Race conditions in collector resets

### Test Plan
1. Add tests for RequestersList methods first
2. Add utils.ts tests
3. Add edge case tests
4. Verify coverage improvements 