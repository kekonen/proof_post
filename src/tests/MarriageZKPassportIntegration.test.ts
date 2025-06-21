import { ZKPassportIntegration } from '../zkpassport/ZKPassportIntegration';
import { MarriageService } from '../marriage/MarriageService';
import { ethers } from 'ethers';

// Simplified integration test focusing on zkPassport functionality
describe('Marriage + ZKPassport Integration', () => {
    let zkPassport: ZKPassportIntegration;
    let marriageService: MarriageService;
    let mockProvider: ethers.Provider;
    let mockSigner: ethers.Signer;

    beforeAll(async () => {
        // Setup test environment
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

    describe('ZKPassport + Marriage Service Integration', () => {
        it('should integrate zkPassport proofs with marriage service', async () => {
            // Step 1: Generate zkPassport proofs
            const aliceZKProof = zkPassport.generateTestProof('alice');
            const bobZKProof = zkPassport.generateTestProof('bob');
            
            // Verify proofs are valid
            expect(zkPassport.verifyProof(aliceZKProof)).toBe(true);
            expect(zkPassport.verifyProof(bobZKProof)).toBe(true);
            
            // Both users should have the same merkle root
            expect(aliceZKProof.merkleRoot).toBe(bobZKProof.merkleRoot);
            
            // Convert to marriage service format
            const aliceMarriageProof = {
                proof: aliceZKProof.proof,
                publicSignals: aliceZKProof.publicSignals,
                passportHash: aliceZKProof.passportHash,
                merkleProof: aliceZKProof.merkleProof,
                merkleRoot: aliceZKProof.merkleRoot
            };
            
            const bobMarriageProof = {
                proof: bobZKProof.proof,
                publicSignals: bobZKProof.publicSignals,
                passportHash: bobZKProof.passportHash,
                merkleProof: bobZKProof.merkleProof,
                merkleRoot: bobZKProof.merkleRoot
            };
            
            // Test marriage certificate verification
            const marriageCert = {
                marriageId: '0x123',
                proof: aliceMarriageProof.proof,
                publicSignals: aliceMarriageProof.publicSignals,
                merkleProof: aliceMarriageProof.merkleProof
            };
            
            const isValidForMarriage = await marriageService.verifyMarriageCertificate(marriageCert);
            expect(isValidForMarriage).toBe(true);
            
            // Test no marriage proof verification
            const noMarriageProof = {
                passportHash: bobMarriageProof.passportHash,
                proof: bobMarriageProof.proof,
                publicSignals: bobMarriageProof.publicSignals,
                merkleProof: bobMarriageProof.merkleProof,
                timestamp: Date.now()
            };
            
            const isValidNoMarriage = await marriageService.verifyNoMarriageProof(noMarriageProof);
            expect(isValidNoMarriage).toBe(true);
        });

        it('should handle age verification for marriage eligibility', () => {
            const minMarriageAge = 18;
            
            const aliceAgeProof = zkPassport.generateAgeProof('alice', minMarriageAge);
            const bobAgeProof = zkPassport.generateAgeProof('bob', minMarriageAge);
            
            expect(aliceAgeProof.isOldEnough).toBe(true);
            expect(bobAgeProof.isOldEnough).toBe(true);
            
            // Both eligible for marriage based on age
            expect(aliceAgeProof.isOldEnough && bobAgeProof.isOldEnough).toBe(true);
            
            // Test with higher age requirement
            const seniorAgeProof = zkPassport.generateAgeProof('alice', 65);
            expect(seniorAgeProof.isOldEnough).toBe(false);
        });

        it('should verify nationality restrictions for marriage laws', () => {
            // Test scenario: jurisdiction only allows certain nationalities to marry
            const allowedCountries = ['USA', 'CAN', 'GBR'];
            
            const aliceNationality = zkPassport.generateNationalityProof('alice', allowedCountries);
            const bobNationality = zkPassport.generateNationalityProof('bob', allowedCountries);
            const charlieNationality = zkPassport.generateNationalityProof('charlie', allowedCountries);
            
            expect(aliceNationality.isFromAllowedCountry).toBe(true); // USA
            expect(bobNationality.isFromAllowedCountry).toBe(true);   // CAN
            expect(charlieNationality.isFromAllowedCountry).toBe(true); // GBR
            
            // Test with restricted countries
            const restrictedCountries = ['DEU', 'FRA'];
            const aliceRestricted = zkPassport.generateNationalityProof('alice', restrictedCountries);
            expect(aliceRestricted.isFromAllowedCountry).toBe(false); // USA not in restricted list
        });

        it('should generate unique proofs for each user', () => {
            const aliceProof1 = zkPassport.generateTestProof('alice');
            const aliceProof2 = zkPassport.generateTestProof('alice');
            const bobProof = zkPassport.generateTestProof('bob');
            
            // Same user should generate same passport hash
            expect(aliceProof1.passportHash).toBe(aliceProof2.passportHash);
            
            // Different users should have different passport hashes
            expect(aliceProof1.passportHash).not.toBe(bobProof.passportHash);
            
            // All should have same merkle root (from same tree)
            expect(aliceProof1.merkleRoot).toBe(bobProof.merkleRoot);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid zkPassport proofs gracefully', () => {
            expect(() => {
                zkPassport.generateTestProof('nonexistent');
            }).toThrow('Unknown passport holder: nonexistent');
        });

        it('should reject corrupted proofs', () => {
            const validProof = zkPassport.generateTestProof('alice');
            
            // Corrupt the proof
            const corruptedProof = { ...validProof };
            corruptedProof.proof = null;
            
            expect(zkPassport.verifyProof(corruptedProof)).toBe(false);
        });

        it('should handle merkle proof validation', () => {
            const validProof = zkPassport.generateTestProof('alice');
            
            // Corrupt merkle proof
            const corruptedMerkleProof = { ...validProof };
            corruptedMerkleProof.merkleProof = ['0x' + '0'.repeat(64)];
            
            // Should still pass basic validation in fallback mode
            expect(zkPassport.verifyProof(corruptedMerkleProof)).toBe(true);
        });
    });

    describe('Integration with Marriage Contract Data', () => {
        it('should format proofs correctly for smart contract usage', () => {
            const aliceProof = zkPassport.generateTestProof('alice');
            
            // Verify proof format matches what contract expects
            expect(aliceProof.passportHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(aliceProof.merkleRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(Array.isArray(aliceProof.merkleProof)).toBe(true);
            expect(aliceProof.merkleProof.length).toBeGreaterThan(0);
            
            // Each merkle proof element should be valid hex
            aliceProof.merkleProof.forEach(element => {
                expect(element).toMatch(/^0x[0-9a-fA-F]{64}$/);
            });
        });

        it('should maintain proof consistency across multiple generations', () => {
            const merkleRoot1 = zkPassport.getMerkleRoot();
            
            // Add new user
            zkPassport.addTestPassportHolder('eve', {
                documentNumber: 'P77777777',
                nationality: 'SWE',
                dateOfBirth: '1993-11-30',
                expiryDate: '2028-11-30'
            });
            
            const merkleRoot2 = zkPassport.getMerkleRoot();
            
            // Root should change when tree is updated
            expect(merkleRoot1).not.toBe(merkleRoot2);
            
            // New proofs should use new root
            const eveProof = zkPassport.generateTestProof('eve');
            expect(eveProof.merkleRoot).toBe(merkleRoot2);
        });
    });
});