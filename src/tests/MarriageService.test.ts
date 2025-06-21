import { MarriageService } from '../marriage/MarriageService';
import { ZKPassportProof } from '../types/marriage';
import { ethers } from 'ethers';

// Simple tests for MarriageService
describe('MarriageService', () => {
    let marriageService: MarriageService;
    let mockProvider: ethers.Provider;
    let mockSigner: ethers.Signer;

    const mockZKPassportProof: ZKPassportProof = {
        proof: {
            pi_a: ["0x1", "0x2", "0x1"],
            pi_b: [["0x1", "0x2"], ["0x3", "0x4"], ["0x1", "0x1"]],
            pi_c: ["0x1", "0x2", "0x1"]
        },
        publicSignals: ["0x123", "0x456"],
        passportHash: "0xabc123",
        merkleProof: ["0xproof1", "0xproof2"],
        merkleRoot: "0xroot123"
    };

    beforeEach(() => {
        // Create mock provider
        mockProvider = {
            getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
            getBlockNumber: jest.fn().mockResolvedValue(1000)
        } as any;

        // Create mock signer with valid address
        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
            signMessage: jest.fn()
        } as any;

        // Create service instance
        marriageService = new MarriageService(
            mockProvider,
            '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Valid contract address
            [], // Empty ABI for testing
            mockSigner
        );
    });

    describe('constructor', () => {
        it('should create MarriageService instance', () => {
            expect(marriageService).toBeInstanceOf(MarriageService);
        });
    });

    describe('verifyMarriageCertificate', () => {
        it('should verify valid marriage certificate', async () => {
            const certificate = {
                marriageId: '0xmarriageId123',
                proof: { pi_a: ["0x1"] },
                publicSignals: ["0x123"],
                merkleProof: ["0xproof1"]
            };

            const result = await marriageService.verifyMarriageCertificate(certificate);

            expect(result).toBe(true);
        });

        it('should reject invalid marriage certificate', async () => {
            const certificate = {
                marriageId: '0xmarriageId123',
                proof: null as any,
                publicSignals: [],
                merkleProof: []
            };

            const result = await marriageService.verifyMarriageCertificate(certificate);

            expect(result).toBe(false);
        });
    });

    describe('verifyNoMarriageProof', () => {
        it('should verify valid no marriage proof', async () => {
            const proof = {
                passportHash: "0xabc123",
                proof: { pi_a: ["0x1"] },
                publicSignals: ["0x123"],
                merkleProof: ["0xproof1"],
                timestamp: Date.now()
            };

            const result = await marriageService.verifyNoMarriageProof(proof);

            expect(result).toBe(true);
        });

        it('should reject invalid no marriage proof', async () => {
            const proof = {
                passportHash: "0xabc123",
                proof: null as any,
                publicSignals: [],
                merkleProof: [],
                timestamp: Date.now()
            };

            const result = await marriageService.verifyNoMarriageProof(proof);

            expect(result).toBe(false);
        });
    });

    describe('helper methods', () => {
        it('should generate nullifier', () => {
            // Test the private generateNullifier method by calling it through a public method that uses it
            const service = marriageService as any;
            const hash1 = '0x' + '1'.repeat(64); // Valid 32-byte hex string
            const hash2 = '0x' + '2'.repeat(64); // Valid 32-byte hex string
            
            const nullifier1 = service.generateNullifier(hash1, 123456);
            const nullifier2 = service.generateNullifier(hash1, 123456);
            const nullifier3 = service.generateNullifier(hash2, 123456);

            // Same inputs should produce same output
            expect(nullifier1).toBe(nullifier2);
            // Different inputs should produce different output
            expect(nullifier1).not.toBe(nullifier3);
            // Should return a valid hex string
            expect(nullifier1).toMatch(/^0x[0-9a-fA-F]{64}$/);
        });
    });
});