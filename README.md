# Marriaged

Marriaged is a zero-knowledge proof of marriage system built on top of zkpassport. It enables privacy-preserving marriage verification where individuals can prove their marriage status without revealing their identity.

## Features

- **Privacy-First Marriage**: Propose and accept marriages using zkpassport proofs
- **ZK Marriage Certificates**: Generate cryptographic proofs of marriage without revealing personal details
- **Proof of Single Status**: Prove you're not married without exposing identity
- **Consensual Divorce**: Either spouse can initiate divorce to dissolve the marriage
- **zkpassport Integration**: Built on top of zkpassport's secure identity verification

## Architecture

- **Smart Contracts**: Solidity contracts with Foundry for testing and deployment
- **ZK Circuits**: Circom circuits for privacy-preserving proofs
- **TypeScript SDK**: High-level API for interacting with the marriage system
- **Comprehensive Testing**: Full test coverage for all functionality

## Quick Start

```bash
# Install dependencies
npm install

# Build contracts
npm run build:contracts

# Run contract tests
npm run test:contracts

# Build TypeScript
npm run build

# Run TypeScript tests  
npm run test
```

## Development Commands

### TypeScript/Backend
- `npm run build`: Compile TypeScript code
- `npm run test`: Run Jest test suite for TypeScript services
- `npm run lint`: Run ESLint on TypeScript files
- `npm run dev`: Run development server with ts-node

### Smart Contracts (Foundry)
- `npm run build:contracts`: Compile Solidity contracts with Forge
- `npm run test:contracts`: Run Foundry tests
- `npm run test:contracts:verbose`: Run Foundry tests with verbose output
- `npm run test:contracts:gas`: Run Foundry tests with gas reporting
- `npm run lint:contracts`: Check Solidity code formatting
- `npm run format:contracts`: Format Solidity code

### Deployment
- `npm run deploy:local`: Deploy to local Anvil network
- `npm run deploy:sepolia`: Deploy to Sepolia testnet
- `npm run setup:test`: Setup test environment with sample users

## Usage Flow

1. **Marriage Proposal**: Person A proposes to Person B using zkpassport proof
2. **Marriage Acceptance**: Person B accepts using their zkpassport proof
3. **Marriage Certificate**: Either spouse generates ZK proof of marriage
4. **Single Status Proof**: Unmarried individuals prove their single status
5. **Divorce**: Either spouse can initiate divorce

## Foundry Reference

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

### Documentation

https://book.getfoundry.sh/

### Basic Commands

```shell
# Build contracts
forge build

# Run tests
forge test

# Format code
forge fmt

# Start local blockchain
anvil

# Deploy contracts
forge script script/DeployMarriageRegistry.s.sol:DeployMarriageRegistry --rpc-url <your_rpc_url> --private-key <your_private_key>

# Interact with contracts
cast <subcommand>
```

Built with privacy, security, and user sovereignty in mind.