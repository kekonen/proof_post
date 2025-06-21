import { RealMarriageService } from '../marriage/RealMarriageService';
import { ethers } from 'ethers';

describe('RealMarriageService', () => {
    let marriageService: RealMarriageService;
    let mockProvider: ethers.Provider;
    let mockSigner: ethers.Signer;
    let mockContract: any;

    beforeEach(() => {
        // Create comprehensive mocks
        mockProvider = {
            getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
            getBlockNumber: jest.fn().mockResolvedValue(1000)
        } as any;

        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
            signMessage: jest.fn()
        } as any;

        // Mock contract methods
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
                appName: 'Marriaged Test'
            },
            jurisdiction: {
                minAge: 18,
                allowedCountries: ['USA', 'CAN'],
                sameSexAllowed: true
            }
        };

        marriageService = new RealMarriageService(config);
        
        // Replace the contract with our mock
        (marriageService as any).contract = mockContract;
    });

    describe('initialization', () => {
        it('should create RealMarriageService instance', () => {
            expect(marriageService).toBeInstanceOf(RealMarriageService);
        });
    });

    describe('createMarriageProposal', () => {
        it('should create marriage proposal successfully', async () => {
            // Mock zkPassport service methods
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                requestId: 'test-request-id',
                verificationUrl: 'https://verify.zkpassport.com/test',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                requiredAttributes: ['age_over_18', 'nationality']
            });

            const request = {
                proposerId: 'user123',
                proposeeId: 'user456',
                jurisdiction: 'US',
                customRequirements: {
                    minAge: 21,
                    allowedCountries: ['USA']
                }
            };

            const result = await marriageService.createMarriageProposal(request);

            expect(result.proposalId).toBeDefined();
            expect(result.proposerVerificationUrl).toBe('https://verify.zkpassport.com/test');
            expect(result.proposeeVerificationUrl).toBe('https://verify.zkpassport.com/test');
            expect(result.expiresAt).toBeInstanceOf(Date);
            expect(result.requirements).toBeDefined();
        });

        it('should handle zkPassport service errors', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockRejectedValue(new Error('Service unavailable'));

            const request = {
                proposerId: 'user123',
                proposeeId: 'user456'
            };

            await expect(marriageService.createMarriageProposal(request)).rejects.toThrow('Failed to create marriage proposal');
        });
    });

    describe('submitZKPassportProof', () => {
        beforeEach(() => {
            // Setup pending verification
            const mockVerification = {
                requestId: 'test-request',
                verificationUrl: 'https://test.com',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                requiredAttributes: ['age_over_18']
            };
            
            (marriageService as any).pendingVerifications.set('test-proposal-proposer', mockVerification);
            (marriageService as any).pendingVerifications.set('test-proposal-proposee', mockVerification);
        });

        it('should submit valid zkPassport proof', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });

            const proofData = {
                proof: 'test-proof',
                publicSignals: ['signal1', 'signal2']
            };

            const result = await marriageService.submitZKPassportProof(
                'test-proposal',
                'proposer',
                proofData
            );

            expect(result.isValid).toBe(true);
            expect(result.userId).toBe('proposer');
            expect(result.canProceed).toBe(false); // Only one proof submitted
        });

        it('should allow proceeding when both proofs are valid', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });
            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: true,
                reasons: []
            });

            // Submit both proofs
            const proofData = { proof: 'test-proof' };
            
            // First proof
            const proposerProof = {
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            };
            
            const proposeeProof = {
                isValid: true,
                nullifier: '0x' + '2'.repeat(64)
            };

            (marriageService as any).completedProofs.set('test-proposal-proposer', proposerProof);
            (marriageService as any).completedProofs.set('test-proposal-proposee', proposeeProof);

            const result = await marriageService.submitZKPassportProof(
                'test-proposal',
                'proposer',
                proofData
            );

            expect(result.canProceed).toBe(true);
        });

        it('should reject invalid proof', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: false
            });

            const result = await marriageService.submitZKPassportProof(
                'test-proposal',
                'proposer',
                { proof: 'invalid' }
            );

            expect(result.isValid).toBe(false);
            expect(result.canProceed).toBe(false);
        });

        it('should handle expired verification', async () => {
            const expiredVerification = {
                requestId: 'test-request',
                verificationUrl: 'https://test.com',
                expiresAt: new Date(Date.now() - 1000), // Expired
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

    describe('executeMarriage', () => {
        it('should execute marriage successfully', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: true,
                reasons: []
            });
            mockZkPassport.generateMarriageCertificateData = jest.fn().mockResolvedValue({
                certificate: { marriageId: 'test-marriage' },
                privacy: {
                    spouse1Nullifier: '0x' + '1'.repeat(64),
                    spouse2Nullifier: '0x' + '2'.repeat(64),
                    marriageProof: {
                        proof1Hash: '0x' + '3'.repeat(64),
                        proof2Hash: '0x' + '4'.repeat(64)
                    }
                }
            });

            // Mock successful transaction
            const mockTx = {
                wait: jest.fn().mockResolvedValue({ hash: '0x' + 'a'.repeat(64) })
            };
            mockContract.createMarriage = jest.fn().mockResolvedValue(mockTx);

            // Setup completed proofs
            const proposerProof = { isValid: true, nullifier: '0x' + '1'.repeat(64) };
            const proposeeProof = { isValid: true, nullifier: '0x' + '2'.repeat(64) };
            
            (marriageService as any).completedProofs.set('test-proposal-proposer', proposerProof);
            (marriageService as any).completedProofs.set('test-proposal-proposee', proposeeProof);

            const result = await marriageService.executeMarriage('test-proposal');

            expect(result.success).toBe(true);
            expect(result.marriageId).toBeDefined();
            expect(result.transactionHash).toBe('0x' + 'a'.repeat(64));
        });

        it('should fail when proofs are missing', async () => {
            const result = await marriageService.executeMarriage('test-proposal');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Both parties must complete zkPassport verification first');
        });

        it('should fail when marriage is not allowed', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.canMarry = jest.fn().mockResolvedValue({
                canMarry: false,
                reasons: ['Age requirement not met']
            });

            // Setup completed proofs
            const proposerProof = { isValid: true, nullifier: '0x' + '1'.repeat(64) };
            const proposeeProof = { isValid: true, nullifier: '0x' + '2'.repeat(64) };
            
            (marriageService as any).completedProofs.set('test-proposal-proposer', proposerProof);
            (marriageService as any).completedProofs.set('test-proposal-proposee', proposeeProof);

            const result = await marriageService.executeMarriage('test-proposal');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Marriage not allowed: Age requirement not met');
        });
    });

    describe('generateMarriageCertificate', () => {
        it('should generate marriage certificate for valid marriage', async () => {
            mockContract.marriages = jest.fn().mockResolvedValue({
                isActive: true,
                marriageDate: Math.floor(Date.now() / 1000)
            });

            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                verificationUrl: 'https://verify.zkpassport.com/cert'
            });

            const result = await marriageService.generateMarriageCertificate('test-marriage', 'user123');

            expect(result.success).toBe(true);
            expect(result.verificationUrl).toBe('https://verify.zkpassport.com/cert');
        });

        it('should fail for inactive marriage', async () => {
            mockContract.marriages = jest.fn().mockResolvedValue({
                isActive: false
            });

            const result = await marriageService.generateMarriageCertificate('test-marriage', 'user123');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Marriage not found or not active');
        });
    });

    describe('verifyMarriageCertificate', () => {
        it('should verify valid marriage certificate', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });

            mockContract.marriages = jest.fn().mockResolvedValue({
                spouse1Nullifier: '0x' + '1'.repeat(64),
                spouse2Nullifier: '0x' + '2'.repeat(64),
                isActive: true,
                marriageDate: Math.floor(Date.now() / 1000)
            });

            const result = await marriageService.verifyMarriageCertificate(
                'test-marriage',
                { proof: 'test-proof' }
            );

            expect(result.isValid).toBe(true);
            expect(result.certificate).toBeDefined();
            expect(result.certificate.zkPassportVerified).toBe(true);
        });

        it('should reject certificate for non-spouse', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '3'.repeat(64) // Different nullifier
            });

            mockContract.marriages = jest.fn().mockResolvedValue({
                spouse1Nullifier: '0x' + '1'.repeat(64),
                spouse2Nullifier: '0x' + '2'.repeat(64),
                isActive: true
            });

            const result = await marriageService.verifyMarriageCertificate(
                'test-marriage',
                { proof: 'test-proof' }
            );

            expect(result.isValid).toBe(false);
            expect(result.error).toContain('You are not part of this marriage');
        });
    });

    describe('generateNoMarriageProof', () => {
        it('should generate no marriage proof request', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.createMarriageVerificationRequest = jest.fn().mockResolvedValue({
                verificationUrl: 'https://verify.zkpassport.com/single'
            });

            const result = await marriageService.generateNoMarriageProof('user123');

            expect(result.success).toBe(true);
            expect(result.verificationUrl).toBe('https://verify.zkpassport.com/single');
        });
    });

    describe('verifyNoMarriageProof', () => {
        it('should verify single status', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });
            mockZkPassport.createSingleStatusProof = jest.fn().mockResolvedValue({
                singleStatusProof: { status: 'single', verified: true }
            });

            mockContract.getMarriageStatusByNullifier = jest.fn().mockResolvedValue({
                isMarried: false
            });

            const result = await marriageService.verifyNoMarriageProof({ proof: 'test-proof' });

            expect(result.isValid).toBe(true);
            expect(result.singleStatus).toBe(true);
            expect(result.proof).toBeDefined();
        });

        it('should detect married status', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });
            mockZkPassport.createSingleStatusProof = jest.fn().mockResolvedValue({
                singleStatusProof: { status: 'married', verified: true }
            });

            mockContract.getMarriageStatusByNullifier = jest.fn().mockResolvedValue({
                isMarried: true
            });

            const result = await marriageService.verifyNoMarriageProof({ proof: 'test-proof' });

            expect(result.isValid).toBe(true);
            expect(result.singleStatus).toBe(false);
        });
    });

    describe('executeDivorce', () => {
        it('should execute divorce successfully', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: true,
                nullifier: '0x' + '1'.repeat(64)
            });

            const mockTx = {
                wait: jest.fn().mockResolvedValue({ hash: '0x' + 'b'.repeat(64) })
            };
            mockContract.requestDivorce = jest.fn().mockResolvedValue(mockTx);

            const result = await marriageService.executeDivorce(
                'test-marriage',
                { proof: 'test-proof' }
            );

            expect(result.success).toBe(true);
            expect(result.transactionHash).toBe('0x' + 'b'.repeat(64));
        });

        it('should reject invalid proof for divorce', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.verifyProof = jest.fn().mockResolvedValue({
                isValid: false
            });

            const result = await marriageService.executeDivorce(
                'test-marriage',
                { proof: 'invalid-proof' }
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid zkPassport proof');
        });
    });

    describe('utility methods', () => {
        it('should get supported countries', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.getSupportedCountries = jest.fn().mockResolvedValue(['USA', 'CAN', 'GBR']);

            const countries = await marriageService.getSupportedCountries();

            expect(countries).toEqual(['USA', 'CAN', 'GBR']);
        });

        it('should perform health check', async () => {
            const mockZkPassport = (marriageService as any).zkPassport;
            mockZkPassport.healthCheck = jest.fn().mockResolvedValue({
                status: 'healthy',
                latency: 100
            });

            const result = await marriageService.healthCheck();

            expect(result.status).toBe('healthy');
            expect(result.zkPassport.status).toBe('healthy');
            expect(result.blockchain.status).toBe('healthy');
        });

        it('should get marriage status', async () => {
            mockContract.getMarriageStatusByNullifier = jest.fn().mockResolvedValue({
                isMarried: true,
                marriageId: '0x' + '1'.repeat(64),
                marriageDate: Math.floor(Date.now() / 1000)
            });

            const result = await marriageService.getMarriageStatus('0x' + '1'.repeat(64));

            expect(result.isMarried).toBe(true);
            expect(result.marriageId).toBeDefined();
            expect(result.marriageDate).toBeInstanceOf(Date);
        });
    });
});