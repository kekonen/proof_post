# ZKPassport Integration Testing Guide

This guide explains how to test Marriaged's integration with zkPassport for privacy-preserving identity verification.

## Overview

Marriaged integrates with zkPassport to enable:
- **Privacy-preserving marriage proposals** using zkPassport identity proofs
- **Age verification** without revealing exact dates of birth
- **Nationality verification** for jurisdiction-specific marriage laws
- **Secure identity verification** without exposing personal data

## Testing Environments

### 1. Local Development Testing

#### Setup
```bash
# Install dependencies
npm install

# Start local blockchain
anvil --port 8545

# Run integration tests
npm run test:zkpassport
```

#### Test Passport Holders
The integration includes pre-configured test users:

- **Alice**: USA passport, born 1990-01-01
- **Bob**: Canadian passport, born 1985-05-15  
- **Charlie**: UK passport, born 1995-12-25

#### Usage Example
```typescript
import { ZKPassportIntegration } from './src/zkpassport/ZKPassportIntegration';

const zkPassport = new ZKPassportIntegration();

// Generate proof for Alice
const aliceProof = zkPassport.generateTestProof('alice');

// Verify the proof
const isValid = zkPassport.verifyProof(aliceProof);
```

### 2. zkPassport SDK Integration

#### Connecting to Real zkPassport
```typescript
// In production, use actual zkPassport SDK
const zkPassportSDK = new ZKPassportSDK({
  apiKey: process.env.ZKPASSPORT_API_KEY,
  environment: 'testnet' // or 'mainnet'
});

await zkPassportSDK.initialize();
```

#### Environment Variables
```bash
# .env file
ZKPASSPORT_API_KEY=your_api_key_here
ZKPASSPORT_ENVIRONMENT=testnet
ZK_PASSPORT_MERKLE_ROOT=0x...
```

## Test Scenarios

### 1. Basic Integration Tests

Run the zkPassport integration tests:
```bash
npm run test -- --testPathPattern=ZKPassportIntegration
```

**Tests include:**
- ✅ Proof generation for test users
- ✅ Merkle tree verification
- ✅ Age verification without revealing exact age
- ✅ Nationality verification
- ✅ Invalid proof rejection

### 2. Full Marriage Flow Tests

Run end-to-end marriage tests with zkPassport:
```bash
npm run test -- --testPathPattern=MarriageZKPassportIntegration
```

**Tests include:**
- ✅ Complete marriage proposal → acceptance → divorce flow
- ✅ zkPassport verification at each step
- ✅ Invalid proof rejection
- ✅ Gas cost measurement
- ✅ Age and nationality requirements

### 3. Smart Contract Integration

Test with deployed contracts:
```bash
# Deploy with zkPassport merkle root
npm run deploy:local

# Run contract tests
npm run test:contracts
```

## Testing Different Scenarios

### Age Verification Testing

```typescript
// Test minimum age requirement
const ageProof = zkPassport.generateAgeProof('alice', 18);
expect(ageProof.isOldEnough).toBe(true);

// Test with higher age requirement
const seniorProof = zkPassport.generateAgeProof('alice', 65);
expect(seniorProof.isOldEnough).toBe(false);
```

### Nationality Verification Testing

```typescript
// Test allowed countries
const usaNationalityProof = zkPassport.generateNationalityProof('alice', ['USA', 'CAN']);
expect(usaNationalityProof.isFromAllowedCountry).toBe(true);

// Test restricted countries
const restrictedProof = zkPassport.generateNationalityProof('alice', ['GBR', 'DEU']);
expect(restrictedProof.isFromAllowedCountry).toBe(false);
```

### Custom Test Data

Add your own test passport holders:
```typescript
zkPassport.addTestPassportHolder('david', {
  documentNumber: 'P55555555',
  nationality: 'AUS',
  dateOfBirth: '1988-03-20',
  expiryDate: '2033-03-20'
});

const davidProof = zkPassport.generateTestProof('david');
```

## Integration with Real zkPassport

### 1. SDK Installation

```bash
# Install zkPassport SDK (when available)
npm install @zkpassport/sdk
```

### 2. Real Proof Generation

```typescript
import { ZKPassportSDK } from '@zkpassport/sdk';

// Initialize with real API
const sdk = new ZKPassportSDK({
  apiKey: process.env.ZKPASSPORT_API_KEY
});

// Generate real proof from passport scan
const realProof = await sdk.generateProof({
  type: 'identity',
  attributes: ['age_over_18', 'nationality']
});
```

### 3. Proof Verification

```typescript
// Verify with zkPassport verifier
const isValidProof = await sdk.verifyProof(realProof);

// Use in marriage contract
if (isValidProof) {
  await marriageContract.proposeMarriage(
    proposalId,
    proposee,
    nonce,
    realProof.merkleProof
  );
}
```

## Troubleshooting

### Common Issues

1. **Invalid Merkle Proof**
   ```
   Error: Invalid zkPassport proof
   ```
   - Ensure merkle root matches between test data and contract
   - Verify proof generation uses correct tree structure

2. **Gas Estimation Errors**
   ```
   Error: cannot estimate gas
   ```
   - Check zkPassport proof is valid before transaction
   - Ensure user isn't already married

3. **SDK Connection Issues**
   ```
   Error: Failed to connect to zkPassport SDK
   ```
   - Verify API key is correct
   - Check network connectivity
   - Ensure SDK version compatibility

### Debug Mode

Enable debug logging:
```typescript
const zkPassport = new ZKPassportIntegration();
zkPassport.setDebugMode(true); // Logs proof generation details
```

## Performance Considerations

### Gas Costs
- **Marriage Proposal**: ~125,000 gas
- **Marriage Acceptance**: ~317,000 gas
- **Divorce Request**: ~266,000 gas

### Proof Size
- zkPassport proofs are typically 1-2KB
- Merkle proofs scale logarithmically with user count
- Consider batch verification for multiple proofs

## Security Considerations

### Test Environment
- ⚠️ Never use test private keys in production
- ⚠️ Test merkle roots are for development only
- ⚠️ Mock proofs don't provide real privacy guarantees

### Production Environment
- ✅ Use real zkPassport API keys
- ✅ Validate all proofs on-chain
- ✅ Implement proper key management
- ✅ Regular security audits

## Next Steps

1. **Get zkPassport API Access**: Contact zkPassport team for production API keys
2. **Integration Testing**: Test with real passport scanning on mobile devices
3. **Security Audit**: Have smart contracts audited before mainnet deployment
4. **User Testing**: Conduct UX testing with real users and passport scanning

## Resources

- [zkPassport Website](https://zkpassport.id/)
- [zkPassport GitHub](https://github.com/zkpassport)
- [OpenPassport Project](https://github.com/zk-passport/openpassport)
- [Marriaged Documentation](./README.md)

---

For questions about zkPassport integration, consult their documentation or reach out to their developer community.