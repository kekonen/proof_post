import { ethers } from 'ethers';
import { RealZKPassportService, ZKPassportProofResult, MarriageVerificationRequest } from '../zkpassport/RealZKPassportService';
import { Marriage, MarriageProposal, MarriageCertificate, NoMarriageProof } from '../types/marriage';

export interface RealMarriageConfig {
    provider: ethers.Provider;
    contractAddress: string;
    contractAbi: any[];
    signer: ethers.Signer;
    zkPassportConfig: {
        domain: string;
        environment?: 'development' | 'production';
        appName?: string;
        appLogo?: string;
    };
    jurisdiction: {
        minAge?: number;
        allowedCountries?: string[];
        sameSexAllowed?: boolean;
    };
}

export interface MarriageProposalRequest {
    proposerId: string;
    proposeeId: string;
    jurisdiction?: string;
    customRequirements?: {
        minAge?: number;
        allowedCountries?: string[];
    };
}

export interface MarriageProposalResponse {
    proposalId: string;
    proposerVerificationUrl: string;
    proposeeVerificationUrl: string;
    expiresAt: Date;
    requirements: any;
}

export class RealMarriageService {
    private provider: ethers.Provider;
    private contract: ethers.Contract;
    private signer: ethers.Signer;
    private zkPassport: RealZKPassportService;
    private jurisdiction: any;

    // Store pending verifications
    private pendingVerifications = new Map<string, MarriageVerificationRequest>();
    private completedProofs = new Map<string, ZKPassportProofResult>();

    constructor(config: RealMarriageConfig) {
        this.provider = config.provider;
        this.contract = new ethers.Contract(config.contractAddress, config.contractAbi, config.signer);
        this.signer = config.signer;
        this.jurisdiction = config.jurisdiction || { minAge: 18, allowedCountries: [], sameSexAllowed: true };
        
        this.zkPassport = new RealZKPassportService(config.zkPassportConfig);
    }

    /**
     * Step 1: Create marriage proposal with zkPassport verification
     */
    async createMarriageProposal(request: MarriageProposalRequest): Promise<MarriageProposalResponse> {
        const { proposerId, proposeeId, customRequirements = {} } = request;
        
        const requirements = {
            ...this.jurisdiction,
            ...customRequirements
        };

        try {
            // Create verification requests for both parties
            const proposerVerification = await this.zkPassport.createMarriageVerificationRequest(
                proposerId,
                requirements
            );

            const proposeeVerification = await this.zkPassport.createMarriageVerificationRequest(
                proposeeId,
                requirements
            );

            const proposalId = ethers.keccak256(
                ethers.solidityPacked(
                    ['string', 'string', 'uint256'],
                    [proposerId, proposeeId, Date.now()]
                )
            );

            // Store pending verifications
            this.pendingVerifications.set(`${proposalId}-proposer`, proposerVerification);
            this.pendingVerifications.set(`${proposalId}-proposee`, proposeeVerification);

            return {
                proposalId,
                proposerVerificationUrl: proposerVerification.verificationUrl,
                proposeeVerificationUrl: proposeeVerification.verificationUrl,
                expiresAt: proposerVerification.expiresAt,
                requirements
            };
        } catch (error) {
            throw new Error(`Failed to create marriage proposal: ${error}`);
        }
    }

    /**
     * Step 2: Submit zkPassport proof for verification
     */
    async submitZKPassportProof(
        proposalId: string,
        role: 'proposer' | 'proposee',
        proofData: any
    ): Promise<{
        isValid: boolean;
        userId: string;
        canProceed: boolean;
        errors?: string[];
    }> {
        const verificationKey = `${proposalId}-${role}`;
        const pendingVerification = this.pendingVerifications.get(verificationKey);

        if (!pendingVerification) {
            throw new Error('No pending verification found for this proposal');
        }

        if (new Date() > pendingVerification.expiresAt) {
            throw new Error('Verification request has expired');
        }

        try {
            // Verify the zkPassport proof
            const proofResult = await this.zkPassport.verifyProof(proofData);

            if (!proofResult.isValid) {
                return {
                    isValid: false,
                    userId: '',
                    canProceed: false,
                    errors: ['Invalid zkPassport proof']
                };
            }

            // Store the completed proof
            this.completedProofs.set(verificationKey, proofResult);

            // Check if we have proofs from both parties
            const proposerProof = this.completedProofs.get(`${proposalId}-proposer`);
            const proposeeProof = this.completedProofs.get(`${proposalId}-proposee`);

            let canProceed = false;
            let errors: string[] = [];

            if (proposerProof && proposeeProof) {
                // Both proofs submitted, check if they can marry
                const marriageCheck = await this.zkPassport.canMarry(
                    proposerProof,
                    proposeeProof,
                    this.jurisdiction
                );

                canProceed = marriageCheck.canMarry;
                errors = marriageCheck.reasons;
            }

            return {
                isValid: true,
                userId: role === 'proposer' ? 'proposer' : 'proposee',
                canProceed,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error) {
            throw new Error(`Failed to verify zkPassport proof: ${error}`);
        }
    }

    /**
     * Step 3: Execute marriage on blockchain after both parties verified
     */
    async executeMarriage(proposalId: string): Promise<{
        success: boolean;
        marriageId?: string;
        transactionHash?: string;
        error?: string;
    }> {
        const proposerProof = this.completedProofs.get(`${proposalId}-proposer`);
        const proposeeProof = this.completedProofs.get(`${proposalId}-proposee`);

        if (!proposerProof || !proposeeProof) {
            return {
                success: false,
                error: 'Both parties must complete zkPassport verification first'
            };
        }

        // Final check if they can marry
        const marriageCheck = await this.zkPassport.canMarry(
            proposerProof,
            proposeeProof,
            this.jurisdiction
        );

        if (!marriageCheck.canMarry) {
            return {
                success: false,
                error: `Marriage not allowed: ${marriageCheck.reasons.join(', ')}`
            };
        }

        try {
            // Generate marriage certificate data
            const marriageId = ethers.keccak256(
                ethers.solidityPacked(
                    ['string', 'bytes32', 'bytes32', 'uint256'],
                    [proposalId, proposerProof.nullifier!, proposeeProof.nullifier!, Date.now()]
                )
            );

            const { certificate, privacy } = await this.zkPassport.generateMarriageCertificateData(
                proposerProof,
                proposeeProof,
                marriageId
            );

            // Execute marriage on smart contract
            const tx = await this.contract.createMarriage(
                marriageId,
                privacy.spouse1Nullifier,
                privacy.spouse2Nullifier,
                privacy.marriageProof.proof1Hash,
                privacy.marriageProof.proof2Hash
            );

            const receipt = await tx.wait();

            // Clean up temporary data
            this.pendingVerifications.delete(`${proposalId}-proposer`);
            this.pendingVerifications.delete(`${proposalId}-proposee`);
            this.completedProofs.delete(`${proposalId}-proposer`);
            this.completedProofs.delete(`${proposalId}-proposee`);

            return {
                success: true,
                marriageId,
                transactionHash: receipt.hash
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to execute marriage on blockchain: ${error}`
            };
        }
    }

    /**
     * Generate marriage certificate with zkPassport verification
     */
    async generateMarriageCertificate(
        marriageId: string,
        requesterId: string
    ): Promise<{
        success: boolean;
        certificate?: any;
        verificationUrl?: string;
        error?: string;
    }> {
        try {
            // Check if marriage exists on blockchain
            const marriage = await this.contract.marriages(marriageId);
            if (!marriage.isActive) {
                return {
                    success: false,
                    error: 'Marriage not found or not active'
                };
            }

            // Create verification request for the requester
            const verification = await this.zkPassport.createMarriageVerificationRequest(requesterId, {
                requireDocumentValidity: true
            });

            return {
                success: true,
                verificationUrl: verification.verificationUrl
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to generate marriage certificate: ${error}`
            };
        }
    }

    /**
     * Verify marriage certificate after zkPassport verification
     */
    async verifyMarriageCertificate(
        marriageId: string,
        zkPassportProofData: any
    ): Promise<{
        isValid: boolean;
        certificate?: any;
        error?: string;
    }> {
        try {
            // Verify zkPassport proof
            const proofResult = await this.zkPassport.verifyProof(zkPassportProofData);
            if (!proofResult.isValid) {
                return {
                    isValid: false,
                    error: 'Invalid zkPassport proof'
                };
            }

            // Check if the requester is part of this marriage
            const marriage = await this.contract.marriages(marriageId);
            const requesterNullifier = proofResult.nullifier;

            if (marriage.spouse1Nullifier !== requesterNullifier && 
                marriage.spouse2Nullifier !== requesterNullifier) {
                return {
                    isValid: false,
                    error: 'You are not part of this marriage'
                };
            }

            // Generate certificate
            const certificate = {
                marriageId,
                isValid: marriage.isActive,
                marriageDate: new Date(Number(marriage.marriageDate) * 1000),
                verifiedBy: 'zkPassport',
                requesterNullifier,
                zkPassportVerified: true
            };

            return {
                isValid: true,
                certificate
            };
        } catch (error) {
            return {
                isValid: false,
                error: `Failed to verify marriage certificate: ${error}`
            };
        }
    }

    /**
     * Generate proof of no marriage (single status)
     */
    async generateNoMarriageProof(
        userId: string
    ): Promise<{
        success: boolean;
        verificationUrl?: string;
        error?: string;
    }> {
        try {
            const verification = await this.zkPassport.createMarriageVerificationRequest(userId, {
                requireDocumentValidity: true
            });

            return {
                success: true,
                verificationUrl: verification.verificationUrl
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to generate no marriage proof: ${error}`
            };
        }
    }

    /**
     * Verify proof of no marriage after zkPassport verification
     */
    async verifyNoMarriageProof(
        zkPassportProofData: any
    ): Promise<{
        isValid: boolean;
        singleStatus?: boolean;
        proof?: any;
        error?: string;
    }> {
        try {
            // Verify zkPassport proof
            const proofResult = await this.zkPassport.verifyProof(zkPassportProofData);
            if (!proofResult.isValid) {
                return {
                    isValid: false,
                    error: 'Invalid zkPassport proof'
                };
            }

            // Check marriage status on blockchain
            const marriageStatus = await this.contract.getMarriageStatusByNullifier(proofResult.nullifier);

            const singleStatusProof = await this.zkPassport.createSingleStatusProof(
                'user',
                proofResult
            );

            return {
                isValid: true,
                singleStatus: !marriageStatus.isMarried,
                proof: singleStatusProof.singleStatusProof
            };
        } catch (error) {
            return {
                isValid: false,
                error: `Failed to verify no marriage proof: ${error}`
            };
        }
    }

    /**
     * Request divorce with zkPassport verification
     */
    async requestDivorce(
        marriageId: string,
        requesterId: string
    ): Promise<{
        success: boolean;
        verificationUrl?: string;
        error?: string;
    }> {
        try {
            const verification = await this.zkPassport.createMarriageVerificationRequest(requesterId, {
                requireDocumentValidity: true
            });

            return {
                success: true,
                verificationUrl: verification.verificationUrl
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to create divorce request: ${error}`
            };
        }
    }

    /**
     * Execute divorce after zkPassport verification
     */
    async executeDivorce(
        marriageId: string,
        zkPassportProofData: any
    ): Promise<{
        success: boolean;
        transactionHash?: string;
        error?: string;
    }> {
        try {
            // Verify zkPassport proof
            const proofResult = await this.zkPassport.verifyProof(zkPassportProofData);
            if (!proofResult.isValid) {
                return {
                    success: false,
                    error: 'Invalid zkPassport proof'
                };
            }

            // Execute divorce on smart contract
            const tx = await this.contract.requestDivorce(
                marriageId,
                proofResult.nullifier
            );

            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: receipt.hash
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to execute divorce: ${error}`
            };
        }
    }

    /**
     * Get supported countries from zkPassport
     */
    async getSupportedCountries(): Promise<string[]> {
        return await this.zkPassport.getSupportedCountries();
    }

    /**
     * Health check for the service
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        zkPassport: any;
        blockchain: any;
        error?: string;
    }> {
        try {
            // Check zkPassport service
            const zkPassportHealth = await this.zkPassport.healthCheck();

            // Check blockchain connection
            const blockNumber = await this.provider.getBlockNumber();
            const blockchainHealth = {
                status: 'healthy' as const,
                blockNumber,
                latency: 0
            };

            return {
                status: zkPassportHealth.status === 'healthy' && blockchainHealth.status === 'healthy' 
                    ? 'healthy' : 'unhealthy',
                zkPassport: zkPassportHealth,
                blockchain: blockchainHealth
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                zkPassport: { status: 'unknown' },
                blockchain: { status: 'unknown' },
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Get marriage status
     */
    async getMarriageStatus(nullifier: string): Promise<{
        isMarried: boolean;
        marriageId?: string;
        marriageDate?: Date;
    }> {
        try {
            const status = await this.contract.getMarriageStatusByNullifier(nullifier);
            return {
                isMarried: status.isMarried,
                marriageId: status.marriageId,
                marriageDate: status.marriageDate ? new Date(Number(status.marriageDate) * 1000) : undefined
            };
        } catch (error) {
            return { isMarried: false };
        }
    }
}