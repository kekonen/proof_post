import { RealMarriageService } from '../marriage/RealMarriageService';
import { RealZKPassportService } from '../zkpassport/RealZKPassportService';
import { ethers } from 'ethers';

describe('Real zkPassport + Marriage Integration', () => {
    let marriageService: RealMarriageService;
    let zkPassportService: RealZKPassportService;
    let mockProvider: ethers.Provider;
    let mockSigner: ethers.Signer;
    let mockContract: any;

    beforeAll(async () => {
        // Setup test environment with real services
        mockProvider = {
            getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
            getBlockNumber: jest.fn().mockResolvedValue(1000)
        } as any;

        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
            signMessage: jest.fn()
        } as any;

        mockContract = {
            marriages: jest.fn(),
            createMarriage: jest.fn(),
            requestDivorce: jest.fn(),
            getMarriageStatusByNullifier: jest.fn()
        };

        const config = {
            provider: mockProvider,
            contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            contractAbi: [],
            signer: mockSigner,
            zkPassportConfig: {
                domain: 'test.marriaged.app',
                environment: 'development' as const,
                appName: 'Marriaged Integration Test'
            },
            jurisdiction: {
                minAge: 18,
                sameSexAllowed: true
            }
        };

        marriageService = new RealMarriageService(config);
        zkPassportService = new RealZKPassportService(config.zkPassportConfig);
        
        // Replace the contract with our mock
        (marriageService as any).contract = mockContract;
    });

    describe('End-to-End Marriage Flow', () => {
        it('should complete full marriage flow with real zkPassport integration', async () => {
            // Mock zkPassport service calls
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Step 1: Create marriage proposal
            mockZkPassport.createMarriageVerificationRequest = jest.fn()
                .mockResolvedValueOnce({
                    requestId: 'proposer-request',
                    verificationUrl: 'https://verify.zkpassport.com/proposer',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    requiredAttributes: ['age_over_18', 'nationality', 'document_validity']
                })
                .mockResolvedValueOnce({
                    requestId: 'proposee-request',
                    verificationUrl: 'https://verify.zkpassport.com/proposee',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    requiredAttributes: ['age_over_18', 'nationality', 'document_validity']
                });

            const proposalRequest = {
                proposerId: 'alice-2024',
                proposeeId: 'bob-2024',
                jurisdiction: 'US',
                customRequirements: {
                    minAge: 18
                }
            };

            const proposal = await marriageService.createMarriageProposal(proposalRequest);
            
            expect(proposal.proposalId).toBeDefined();
            expect(proposal.proposerVerificationUrl).toContain('verify.zkpassport.com');
            expect(proposal.proposeeVerificationUrl).toContain('verify.zkpassport.com');

            // Step 2: Submit zkPassport proofs
            mockZkPassport.verifyProof = jest.fn()
                .mockResolvedValueOnce({
                    isValid: true,
                    nationality: 'USA',
                    ageOver18: true,
                    documentValid: true,
                    nullifier: '0x' + '1'.repeat(64),
                    proofData: {
                        // Zero-knowledge: no personal data disclosed
                        zkPassportVerified: true,
                        ageVerified: true,
                        documentVerified: true
                    }
                })
                .mockResolvedValueOnce({
                    isValid: true,
                    nationality: 'CAN',
                    ageOver18: true,
                    documentValid: true,
                    nullifier: '0x' + '2'.repeat(64),
                    proofData: {
                        // Zero-knowledge: no personal data disclosed
                        zkPassportVerified: true,
                        ageVerified: true,
                        documentVerified: true
                    }
                });

            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: true,
                reasons: []
            });

            // Submit proposer proof (zero-knowledge)
            const proposerProofData = {
                proof: 'alice-zkpassport-proof',
                publicSignals: ['signal1', 'signal2'],
                // Zero-knowledge: no personal data disclosed
                zkPassportVerified: true,
                ageVerified: true,
                documentVerified: true
            };

            const proposerResult = await marriageService.submitZKPassportProof(
                proposal.proposalId,
                'proposer',
                proposerProofData
            );

            expect(proposerResult.isValid).toBe(true);
            expect(proposerResult.userId).toBe('proposer');

            // Submit proposee proof (zero-knowledge)
            const proposeeProofData = {
                proof: 'bob-zkpassport-proof',
                publicSignals: ['signal3', 'signal4'],
                // Zero-knowledge: no personal data disclosed
                zkPassportVerified: true,
                ageVerified: true,
                documentVerified: true
            };

            const proposeeResult = await marriageService.submitZKPassportProof(
                proposal.proposalId,
                'proposee',
                proposeeProofData
            );

            expect(proposeeResult.isValid).toBe(true);
            expect(proposeeResult.canProceed).toBe(true);

            // Step 3: Execute marriage on blockchain
            mockZkPassport.generateMarriageCertificateData = jest.fn().mockResolvedValue({
                certificate: {
                    marriageId: '0x' + 'marriage'.repeat(8),
                    verificationLevel: 'zero-knowledge',
                    // Zero-knowledge: no personal data in certificate
                    spouse1: { 
                        ageVerified: true, 
                        documentValid: true, 
                        zkPassportVerified: true 
                    },
                    spouse2: { 
                        ageVerified: true, 
                        documentValid: true, 
                        zkPassportVerified: true 
                    }
                },
                privacy: {
                    spouse1Nullifier: '0x' + '1'.repeat(64),
                    spouse2Nullifier: '0x' + '2'.repeat(64),
                    marriageProof: {
                        proof1Hash: '0x' + '3'.repeat(64),
                        proof2Hash: '0x' + '4'.repeat(64)
                    }
                }
            });

            const mockTx = {
                wait: jest.fn().mockResolvedValue({ hash: '0x' + 'success'.repeat(8) })
            };
            mockContract.createMarriage = jest.fn().mockResolvedValue(mockTx);

            const marriageResult = await marriageService.executeMarriage(proposal.proposalId);

            expect(marriageResult.success).toBe(true);
            expect(marriageResult.marriageId).toBeDefined();
            expect(marriageResult.transactionHash).toBe('0x' + 'success'.repeat(8));

            // Verify contract was called with correct parameters
            expect(mockContract.createMarriage).toHaveBeenCalledWith(
                expect.any(String), // marriageId
                '0x' + '1'.repeat(64), // spouse1Nullifier
                '0x' + '2'.repeat(64), // spouse2Nullifier
                '0x' + '3'.repeat(64), // proof1Hash
                '0x' + '4'.repeat(64)  // proof2Hash
            );
        });

        it('should reject marriage when requirements not met', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Create proposal
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                requestId: 'test-request',
                verificationUrl: 'https://verify.zkpassport.com/test',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                requiredAttributes: ['age_over_18']
            });

            const proposal = await marriageService.createMarriageProposal({
                proposerId: 'underage-user',
                proposeeId: 'valid-user'
            });

            // Submit proofs with one underage user
            mockZkPassport.verifyProof = jest.fn()
                .mockResolvedValueOnce({
                    isValid: true,
                    ageOver18: false, // Underage
                    documentValid: true,
                    nullifier: '0x' + '1'.repeat(64)
                })
                .mockResolvedValueOnce({
                    isValid: true,
                    ageOver18: true,
                    documentValid: true,
                    nullifier: '0x' + '2'.repeat(64)
                });

            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: false,
                reasons: ['Both parties must be over 18 years old']
            });

            await marriageService.submitZKPassportProof(proposal.proposalId, 'proposer', { proof: 'test' });
            await marriageService.submitZKPassportProof(proposal.proposalId, 'proposee', { proof: 'test' });

            const marriageResult = await marriageService.executeMarriage(proposal.proposalId);

            expect(marriageResult.success).toBe(false);
            expect(marriageResult.error).toContain('Both parties must be over 18 years old');
        });
    });

    describe('Marriage Certificate Generation', () => {
        it('should generate and verify marriage certificate', async () => {
            const marriageId = '0x' + 'cert'.repeat(16);
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Mock active marriage
            mockContract.marriages = jest.fn().mockResolvedValue({
                isActive: true,
                spouse1Nullifier: '0x' + '1'.repeat(64),
                spouse2Nullifier: '0x' + '2'.repeat(64),
                marriageDate: Math.floor(Date.now() / 1000)
            });

            // Step 1: Generate certificate request
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                verificationUrl: 'https://verify.zkpassport.com/certificate'
            });

            const certRequest = await marriageService.generateMarriageCertificate(marriageId, 'spouse1');

            expect(certRequest.success).toBe(true);
            expect(certRequest.verificationUrl).toContain('certificate');

            // Step 2: Verify certificate with zkPassport proof
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64) // Matches spouse1
            });

            const certVerification = await marriageService.verifyMarriageCertificate(
                marriageId,
                { proof: 'spouse1-proof', publicSignals: [] }
            );

            expect(certVerification.isValid).toBe(true);
            expect(certVerification.certificate).toBeDefined();
            expect(certVerification.certificate.zkPassportVerified).toBe(true);
        });
    });

    describe('Single Status Verification', () => {
        it('should generate and verify proof of no marriage', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Step 1: Generate no marriage proof request
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                verificationUrl: 'https://verify.zkpassport.com/single'
            });

            const singleRequest = await marriageService.generateNoMarriageProof('single-user');

            expect(singleRequest.success).toBe(true);
            expect(singleRequest.verificationUrl).toContain('single');

            // Step 2: Verify single status
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '5'.repeat(64)
            });

            mockZkPassport.createSingleStatusProof = jest.fn().mockResolvedValue({
                singleStatusProof: {
                    status: 'single',
                    verified: true,
                    timestamp: Date.now()
                }
            });

            mockContract.getMarriageStatusByNullifier = jest.fn().mockResolvedValue({
                isMarried: false
            });

            const singleVerification = await marriageService.verifyNoMarriageProof({
                proof: 'single-user-proof'
            });

            expect(singleVerification.isValid).toBe(true);
            expect(singleVerification.singleStatus).toBe(true);
            expect(singleVerification.proof).toBeDefined();
        });
    });

    describe('Divorce Process', () => {
        it('should handle divorce with zkPassport verification', async () => {
            const marriageId = '0x' + 'divorce'.repeat(8);
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Step 1: Request divorce
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                verificationUrl: 'https://verify.zkpassport.com/divorce'
            });

            const divorceRequest = await marriageService.requestDivorce(marriageId, 'spouse1');

            expect(divorceRequest.success).toBe(true);
            expect(divorceRequest.verificationUrl).toContain('divorce');

            // Step 2: Execute divorce with zkPassport proof
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });

            const mockTx = {
                wait: jest.fn().mockResolvedValue({ hash: '0x' + 'divorce'.repeat(8) })
            };
            mockContract.requestDivorce = jest.fn().mockResolvedValue(mockTx);

            const divorceResult = await marriageService.executeDivorce(
                marriageId,
                { proof: 'spouse1-divorce-proof' }
            );

            expect(divorceResult.success).toBe(true);
            expect(divorceResult.transactionHash).toBe('0x' + 'divorce'.repeat(8));
        });
    });

    describe('Service Health and Configuration', () => {
        it('should perform comprehensive health check', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.healthCheck = jest.fn().mockResolvedValue({
                status: 'healthy',
                latency: 150
            });

            const health = await marriageService.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.zkPassport.status).toBe('healthy');
            expect(health.blockchain.status).toBe('healthy');
            expect(health.blockchain.blockNumber).toBe(1000);
        });

        it('should get supported countries from zkPassport', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.getSupportedCountries = jest.fn().mockResolvedValue([
                'USA', 'CAN', 'GBR', 'DEU', 'FRA', 'AUS', 'JPN'
            ]);

            const countries = await marriageService.getSupportedCountries();

            expect(countries).toContain('USA');
            expect(countries).toContain('CAN');
            expect(countries).toContain('GBR');
            expect(countries.length).toBeGreaterThan(5);
        });

        it('should handle marriage status queries', async () => {
            const testNullifier = '0x' + '1'.repeat(64);
            
            mockContract.getMarriageStatusByNullifier = jest.fn().mockResolvedValue({
                isMarried: true,
                marriageId: '0x' + 'status'.repeat(8),
                marriageDate: Math.floor(Date.now() / 1000)
            });

            const status = await marriageService.getMarriageStatus(testNullifier);

            expect(status.isMarried).toBe(true);
            expect(status.marriageId).toBeDefined();
            expect(status.marriageDate).toBeInstanceOf(Date);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle zkPassport service unavailability', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockRejectedValue(
                new Error('zkPassport service unavailable')
            );

            await expect(marriageService.createMarriageProposal({
                proposerId: 'user1',
                proposeeId: 'user2'
            })).rejects.toThrow('Failed to create marriage proposal');
        });

        it('should handle blockchain transaction failures', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            
            // Setup successful proofs
            const proposerProof = { isValid: true, nullifier: '0x' + '1'.repeat(64) };
            const proposeeProof = { isValid: true, nullifier: '0x' + '2'.repeat(64) };
            
            (marriageService as any).completedProofs.set('test-proposal-proposer', proposerProof);
            (marriageService as any).completedProofs.set('test-proposal-proposee', proposeeProof);

            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: true,
                reasons: []
            });

            mockZkPassport.generateMarriageCertificateData = jest.fn().mockResolvedValue({
                certificate: { marriageId: 'test' },
                privacy: {
                    spouse1Nullifier: '0x' + '1'.repeat(64),
                    spouse2Nullifier: '0x' + '2'.repeat(64),
                    marriageProof: {
                        proof1Hash: '0x' + '3'.repeat(64),
                        proof2Hash: '0x' + '4'.repeat(64)
                    }
                }
            });

            // Mock transaction failure
            mockContract.createMarriage = jest.fn().mockRejectedValue(
                new Error('Transaction failed: insufficient gas')
            );

            const result = await marriageService.executeMarriage('test-proposal');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to execute marriage on blockchain');
        });

        it('should handle expired verification requests', async () => {
            const expiredVerification = {
                requestId: 'expired-request',
                verificationUrl: 'https://test.com',
                expiresAt: new Date(Date.now() - 1000), // Already expired
                requiredAttributes: ['age_over_18']
            };
            
            (marriageService as any).pendingVerifications.set('expired-proposal-proposer', expiredVerification);

            await expect(marriageService.submitZKPassportProof(
                'expired-proposal',
                'proposer',
                { proof: 'test' }
            )).rejects.toThrow('Verification request has expired');
        });
    });
});