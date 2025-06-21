import { MarriageService } from '../marriage/MarriageService';
import { ZKPassportProof } from '../types/marriage';
import { ethers } from 'ethers';

describe('MarriageService', () => {
    let marriageService: MarriageService;
    let mockProvider: jest.Mocked<ethers.Provider>;
    let mockSigner: jest.Mocked<ethers.Signer>;
    let mockContract: jest.Mocked<ethers.Contract>;

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
        mockProvider = {
            getNetwork: jest.fn(),
            getBlockNumber: jest.fn()
        } as any;

        mockSigner = {
            getAddress: jest.fn().mockResolvedValue('0x1234567890abcdef'),
            signMessage: jest.fn()
        } as any;

        mockContract = {
            proposeMarriage: jest.fn(),
            acceptMarriage: jest.fn(),
            marriages: jest.fn(),
            requestDivorce: jest.fn(),
            getMarriageStatus: jest.fn()
        } as any;

        marriageService = new MarriageService(
            mockProvider,
            '0xcontractaddress',
            [],
            mockSigner
        );

        // Replace the contract with our mock
        (marriageService as any).contract = mockContract;
    });

    describe('proposeMarriage', () => {
        it('should propose marriage successfully', async () => {
            const mockTx = { wait: jest.fn().mockResolvedValue({}) };
            mockContract.proposeMarriage.mockResolvedValue(mockTx);

            const result = await marriageService.proposeMarriage(
                '0xproposee123',
                mockZKPassportProof
            );

            expect(result).toBeDefined();
            expect(mockContract.proposeMarriage).toHaveBeenCalled();
        });

        it('should throw error if zkPassport proof is invalid', async () => {
            mockContract.proposeMarriage.mockRejectedValue(new Error('Invalid zkPassport proof'));

            await expect(
                marriageService.proposeMarriage('0xproposee123', mockZKPassportProof)
            ).rejects.toThrow('Invalid zkPassport proof');
        });
    });

    describe('acceptMarriage', () => {
        it('should accept marriage successfully', async () => {
            const mockReceipt = {
                logs: [{
                    fragment: { name: 'MarriageCreated' },
                    args: ['0xmarriageId123']
                }]
            };
            const mockTx = { wait: jest.fn().mockResolvedValue(mockReceipt) };
            mockContract.acceptMarriage.mockResolvedValue(mockTx);

            const result = await marriageService.acceptMarriage(
                '0xproposalId123',
                mockZKPassportProof
            );

            expect(result).toBe('0xmarriageId123');
            expect(mockContract.acceptMarriage).toHaveBeenCalledWith(
                '0xproposalId123',
                mockZKPassportProof.merkleProof
            );
        });
    });

    describe('generateMarriageCertificate', () => {
        it('should generate marriage certificate for active marriage', async () => {
            mockContract.marriages.mockResolvedValue({
                spouse1Hash: '0xspouse1',
                spouse2Hash: '0xspouse2',
                isActive: true,
                marriageDate: Date.now(),
                merkleRoot: '0xroot'
            });

            const result = await marriageService.generateMarriageCertificate(
                '0xmarriageId123',
                { ...mockZKPassportProof, passportHash: '0xspouse1' }
            );

            expect(result).toBeDefined();
            expect(result.marriageId).toBe('0xmarriageId123');
            expect(result.proof).toBeDefined();
        });

        it('should throw error for inactive marriage', async () => {
            mockContract.marriages.mockResolvedValue({
                spouse1Hash: '0xspouse1',
                spouse2Hash: '0xspouse2',
                isActive: false,
                marriageDate: Date.now(),
                merkleRoot: '0xroot'
            });

            await expect(
                marriageService.generateMarriageCertificate('0xmarriageId123', mockZKPassportProof)
            ).rejects.toThrow('Marriage is not active');
        });
    });

    describe('generateNoMarriageProof', () => {
        it('should generate proof of no marriage for single person', async () => {
            mockContract.getMarriageStatus.mockResolvedValue({
                isMarried: false,
                marriageId: ethers.ZeroHash
            });

            const result = await marriageService.generateNoMarriageProof(mockZKPassportProof);

            expect(result).toBeDefined();
            expect(result.passportHash).toBe(mockZKPassportProof.passportHash);
            expect(result.proof).toBeDefined();
        });

        it('should throw error for married person', async () => {
            mockContract.getMarriageStatus.mockResolvedValue({
                isMarried: true,
                marriageId: '0xmarriageId123'
            });

            await expect(
                marriageService.generateNoMarriageProof(mockZKPassportProof)
            ).rejects.toThrow('User is currently married');
        });
    });

    describe('requestDivorce', () => {
        it('should request divorce successfully', async () => {
            const mockTx = { wait: jest.fn().mockResolvedValue({}) };
            mockContract.requestDivorce.mockResolvedValue(mockTx);

            await marriageService.requestDivorce('0xmarriageId123', mockZKPassportProof);

            expect(mockContract.requestDivorce).toHaveBeenCalledWith(
                '0xmarriageId123',
                mockZKPassportProof.merkleProof
            );
        });
    });

    describe('getMarriageStatus', () => {
        it('should return marriage status', async () => {
            const expectedStatus = {
                isMarried: true,
                marriageId: '0xmarriageId123'
            };
            mockContract.getMarriageStatus.mockResolvedValue(expectedStatus);

            const result = await marriageService.getMarriageStatus('0xaddress123');

            expect(result).toEqual(expectedStatus);
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
                proof: null,
                publicSignals: [],
                merkleProof: []
            };

            const result = await marriageService.verifyMarriageCertificate(certificate);

            expect(result).toBe(false);
        });
    });
});