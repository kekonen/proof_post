// Mock implementation of @zkpassport/sdk for testing

class MockZKPassport {
  constructor(domain) {
    this.domain = domain;
  }

  async request({ name, logo, purpose, scope }) {
    const mockQueryBuilder = {
      gte: jest.fn().mockReturnThis(),
      disclose: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      done: jest.fn().mockReturnValue({
        url: `https://mock.zkpassport.com/verify?domain=${this.domain}`,
        requestId: 'mock-request-id',
        onRequestReceived: jest.fn(),
        onGeneratingProof: jest.fn(),
        onBridgeConnect: jest.fn(),
        onProofGenerated: jest.fn(),
        onResult: jest.fn(),
        onReject: jest.fn(),
        onError: jest.fn(),
        isBridgeConnected: jest.fn().mockReturnValue(true),
        requestReceived: jest.fn().mockReturnValue(true)
      })
    };

    return mockQueryBuilder;
  }

  async verify({ proofs, queryResult, scope, devMode = false }) {
    // Mock successful verification for testing
    return {
      uniqueIdentifier: 'mock-unique-id-' + Math.random().toString(36).substr(2, 9),
      verified: true,
      queryResultErrors: undefined
    };
  }

  getSolidityVerifierDetails(network) {
    return {
      address: '0x0000000000000000000000000000000000000000',
      functionName: 'verifyProof',
      abi: []
    };
  }

  getSolidityVerifierParameters({ proof, validityPeriodInDays, domain, scope, devMode }) {
    return {
      vkeyHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      proof: '0x0000000000000000000000000000000000000000000000000000000000000000',
      publicInputs: [],
      committedInputs: '0x0000000000000000000000000000000000000000000000000000000000000000',
      committedInputCounts: [],
      validityPeriodInDays: validityPeriodInDays || 30,
      domain: domain || 'test.domain',
      scope: scope || 'test-scope',
      devMode: devMode || false
    };
  }

  getUrl(requestId) {
    return `https://mock.zkpassport.com/verify?requestId=${requestId}`;
  }

  cancelRequest(requestId) {
    // Mock implementation
  }

  clearAllRequests() {
    // Mock implementation
  }
}

module.exports = {
  ZKPassport: MockZKPassport
};