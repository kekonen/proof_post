import { ZKPassportIntegration } from '../zkpassport/ZKPassportIntegration';
import { MarriageService } from '../marriage/MarriageService';
import { ethers } from 'ethers';

describe('ZKPassport Integration Tests', () => {
    let zkPassport: ZKPassportIntegration;
    let marriageService: MarriageService;
    let mockProvider: ethers.Provider;
    let mockSigner: ethers.Signer;

    beforeEach(() => {
        zkPassport = new ZKPassportIntegration();
        
        mockProvider = {
            getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
            getBlockNumber: jest.fn().mockResolvedValue(1000)
        } as any;

        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
            signMessage: jest.fn()
        } as any;

        marriageService = new MarriageService(
            mockProvider,
            '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            [],
            mockSigner
        );
    });

    describe('ZKPassport Setup', () => {
        it('should initialize with test passport holders', () => {
            const holders = zkPassport.getTestPassportHolders();
            expect(holders).toContain('alice');
            expect(holders).toContain('bob');
            expect(holders).toContain('charlie');
        });

        it('should generate valid merkle root', () => {
            const merkleRoot = zkPassport.getMerkleRoot();
            expect(merkleRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);
        });

        it('should connect to zkPassport SDK', async () => {
            const isConnected = await zkPassport.connectToZKPassportSDK();
            expect(isConnected).toBe(true);
        });
    });

    describe('Proof Generation', () => {
        it('should generate valid zkPassport proof for alice', () => {
            const proof = zkPassport.generateTestProof('alice');
            
            expect(proof.passportHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(proof.merkleProof).toBeInstanceOf(Array);
            expect(proof.merkleProof.length).toBeGreaterThan(0);
            expect(proof.merkleRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(proof.proof).toBeDefined();
            expect(proof.publicSignals).toBeInstanceOf(Array);
        });

        it('should generate different proofs for different users', () => {
            const aliceProof = zkPassport.generateTestProof('alice');
            const bobProof = zkPassport.generateTestProof('bob');
            
            expect(aliceProof.passportHash).not.toBe(bobProof.passportHash);
            expect(aliceProof.merkleRoot).toBe(bobProof.merkleRoot); // Same tree
        });

        it('should throw error for unknown passport holder', () => {
            expect(() => {
                zkPassport.generateTestProof('unknown');
            }).toThrow('Unknown passport holder: unknown');
        });
    });

    describe('Proof Verification', () => {
        it('should verify valid zkPassport proof', () => {
            const proof = zkPassport.generateTestProof('alice');
            const isValid = zkPassport.verifyProof(proof);
            expect(isValid).toBe(true);
        });

        it('should reject invalid merkle proof', () => {
            const proof = zkPassport.generateTestProof('alice');
            proof.merkleProof = ['invalid_proof']; // Invalid proof format
            
            const isValid = zkPassport.verifyProof(proof);
            expect(isValid).toBe(false);
        });

        it('should reject proof with invalid ZK-SNARK', () => {
            const proof = zkPassport.generateTestProof('alice');
            proof.proof = null; // Invalid ZK proof
            
            const isValid = zkPassport.verifyProof(proof);
            expect(isValid).toBe(false);
        });
    });

    describe('Age Verification', () => {
        it('should generate age proof for valid user', () => {
            const ageProof = zkPassport.generateAgeProof('alice', 18);
            
            expect(ageProof.isOldEnough).toBe(true); // Alice born 1990, definitely over 18
            expect(ageProof.proof).toBeDefined();
            expect(ageProof.minAgeRequired).toBe(18);
        });

        it('should handle age verification for different requirements', () => {
            const proof21 = zkPassport.generateAgeProof('alice', 21);
            const proof65 = zkPassport.generateAgeProof('alice', 65);
            
            expect(proof21.isOldEnough).toBe(true);
            expect(proof65.isOldEnough).toBe(false); // Alice not 65+
        });
    });

    describe('Nationality Verification', () => {
        it('should verify nationality for allowed countries', () => {
            const nationalityProof = zkPassport.generateNationalityProof('alice', ['USA', 'CAN']);
            
            expect(nationalityProof.isFromAllowedCountry).toBe(true); // Alice is USA
            expect(nationalityProof.allowedCountries).toEqual(['USA', 'CAN']);
        });

        it('should reject nationality for restricted countries', () => {
            const nationalityProof = zkPassport.generateNationalityProof('alice', ['GBR', 'DEU']);
            
            expect(nationalityProof.isFromAllowedCountry).toBe(false); // Alice is USA, not in allowed list
        });
    });

    describe('Marriage Integration', () => {
        it('should create marriage proposal with zkPassport verification', async () => {
            // Generate zkPassport proofs for both users
            const aliceProof = zkPassport.generateTestProof('alice');
            const bobProof = zkPassport.generateTestProof('bob');
            
            // Verify both proofs are valid
            expect(zkPassport.verifyProof(aliceProof)).toBe(true);
            expect(zkPassport.verifyProof(bobProof)).toBe(true);
            
            // Both users should have the same merkle root
            expect(aliceProof.merkleRoot).toBe(bobProof.merkleRoot);
            
            // Convert to marriage service format
            const marriageProof = {
                proof: aliceProof.proof,
                publicSignals: aliceProof.publicSignals,
                passportHash: aliceProof.passportHash,
                merkleProof: aliceProof.merkleProof,
                merkleRoot: aliceProof.merkleRoot
            };
            
            // This would integrate with actual marriage service
            const isValidForMarriage = await marriageService.verifyMarriageCertificate({
                marriageId: '0x123',
                proof: marriageProof.proof,
                publicSignals: marriageProof.publicSignals,
                merkleProof: marriageProof.merkleProof
            });
            
            expect(isValidForMarriage).toBe(true);
        });

        it('should handle age verification for marriage eligibility', () => {
            const minMarriageAge = 18;
            
            const aliceAgeProof = zkPassport.generateAgeProof('alice', minMarriageAge);
            const bobAgeProof = zkPassport.generateAgeProof('bob', minMarriageAge);
            
            expect(aliceAgeProof.isOldEnough).toBe(true);
            expect(bobAgeProof.isOldEnough).toBe(true);
            
            // Both eligible for marriage based on age
            expect(aliceAgeProof.isOldEnough && bobAgeProof.isOldEnough).toBe(true);
        });
    });

    describe('Dynamic Test Data', () => {
        it('should allow adding new test passport holders', () => {
            const newPassportData = {
                documentNumber: 'P99999999',
                nationality: 'FRA',
                dateOfBirth: '1992-07-14',
                expiryDate: '2032-07-14'
            };
            
            zkPassport.addTestPassportHolder('diana', newPassportData);
            
            const holders = zkPassport.getTestPassportHolders();
            expect(holders).toContain('diana');
            
            // Should be able to generate proof for new user
            const dianaProof = zkPassport.generateTestProof('diana');
            expect(dianaProof.passportHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(zkPassport.verifyProof(dianaProof)).toBe(true);
        });
    });
});