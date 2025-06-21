# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a zero-knowledge proof of marriage system built on top of zkpassport. It enables privacy-preserving marriage verification where individuals can prove their marriage status without revealing their identity.

## Core Architecture

- **zkpassport Integration**: Uses zkpassport's Merkle tree system for identity verification
- **Smart Contracts**: Solidity contracts for marriage registry and state management  
- **ZK Circuits**: Circom circuits for generating marriage proofs and no-marriage proofs
- **TypeScript Service Layer**: High-level API for interacting with the marriage system

## Key Components

- `src/contracts/MarriageRegistry.sol`: Main smart contract for marriage proposals, acceptance, and divorce
- `circuits/marriage_proof.circom`: ZK circuits for proving marriage status without revealing identity
- `src/marriage/MarriageService.ts`: TypeScript service providing high-level marriage operations
- `src/types/marriage.ts`: Core type definitions for marriage system

## Development Commands

### TypeScript/Backend
- `npm run build`: Compile TypeScript code
- `npm test`: Run Jest test suite for TypeScript services
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

### Additional Foundry Commands
- `forge build`: Compile contracts
- `forge test`: Run tests
- `forge fmt`: Format code
- `anvil`: Start local blockchain
- `cast`: Interact with contracts

## Marriage System Flow

1. **Marriage Proposal**: Person A proposes to Person B using zkpassport proof
2. **Marriage Acceptance**: Person B accepts using their zkpassport proof  
3. **Marriage Certificate**: Either spouse can generate ZK proof of marriage
4. **No Marriage Proof**: Single individuals can prove they are not married
5. **Divorce**: Either spouse can initiate divorce, dissolving the marriage

## Privacy Model

- Uses Merkle trees to hide individual identities while proving membership
- Nullifiers prevent double-spending of proofs
- ZK circuits ensure marriage status can be proven without revealing passport details
- Marriage registry maintains privacy through hash-based identifiers

## zkpassport Dependency

The system relies on zkpassport's Merkle root for validating legitimate passport holders. Marriage participants must have valid zkpassport proofs to participate in the marriage system.