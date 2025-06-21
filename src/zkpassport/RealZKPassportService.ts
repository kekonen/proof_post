import { ZKPassport } from '@zkpassport/sdk';
import { ethers } from 'ethers';

// Real zkPassport integration for Marriaged
export interface ZKPassportConfig {
    domain: string;
    environment?: 'development' | 'production';
    appName?: string;
    appLogo?: string;
}

export interface MarriageVerificationRequest {
    requestId: string;
    verificationUrl: string;
    expiresAt: Date;
    requiredAttributes: string[];
}

export interface ZKPassportProofResult {
    isValid: boolean;
    nationality?: string;
    ageOver18?: boolean;
    ageOver21?: boolean;
    documentValid?: boolean;
    proofData?: any;
    nullifier?: string;
}

export class RealZKPassportService {
    private zkPassport: ZKPassport;
    private config: ZKPassportConfig;

    constructor(config: ZKPassportConfig) {
        this.config = {
            appName: 'Marriaged',
            appLogo: 'https://marriaged.app/logo.png',
            environment: 'development',
            ...config
        };
        
        this.zkPassport = new ZKPassport(this.config.domain);
    }

    /**
     * Create a marriage verification request for a user
     */
    async createMarriageVerificationRequest(
        userId: string,
        requirements: {
            minAge?: number;
            requireDocumentValidity?: boolean;
        } = {}
    ): Promise<MarriageVerificationRequest> {
        const {
            minAge = 18,
            requireDocumentValidity = true
        } = requirements;

        try {
            const queryBuilder = await this.zkPassport.request({
                name: this.config.appName!,
                logo: this.config.appLogo!,
                purpose: `Verify identity for marriage registration - User: ${userId}`,
                scope: `marriage-verification-${userId}`,
            });

            // Build verification requirements
            let builder = queryBuilder;

            // Age verification - ensure person is 18 or older
            builder = builder.gte('age', 18);

            // Document type verification (passport)
            builder = builder.disclose('document_type');
            builder = builder.eq('document_type', 'passport');

            // Zero-knowledge verification - no personal data disclosed

            const { url } = builder.done();

            const requestId = ethers.keccak256(
                ethers.solidityPacked(['string', 'uint256', 'uint256'], [userId, Date.now(), Math.floor(Math.random() * 1000000)])
            );

            return {
                requestId,
                verificationUrl: url,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                requiredAttributes: [
                    'document_type'
                    // Zero-knowledge: no personal data required
                ]
            };
        } catch (error) {
            throw new Error(`Failed to create verification request: ${error}`);
        }
    }

    /**
     * Verify a completed zkPassport proof
     */
    async verifyProof(proofData: any): Promise<ZKPassportProofResult> {
        try {
            // The proofData should contain proofs array and queryResult from zkPassport
            const { proofs, queryResult } = proofData;
            
            if (!proofs || !queryResult) {
                return { isValid: false };
            }

            // Use zkPassport SDK to verify the proof
            const verificationResult = await this.zkPassport.verify({
                proofs,
                queryResult,
                scope: queryResult.scope || 'marriage-verification',
                devMode: this.config.environment === 'development'
            });

            if (!verificationResult.verified) {
                return { isValid: false };
            }

            // Extract age verification from constraints
            const ageOver18 = queryResult.age?.gte?.result === true;
            const ageOver21 = queryResult.age?.gte?.expected >= 21 && queryResult.age?.gte?.result === true;
            
            // Extract verified attributes from the query result
            const result: ZKPassportProofResult = {
                isValid: true,
                nationality: queryResult.nationality?.disclose?.result,
                ageOver18: ageOver18,
                ageOver21: ageOver21,
                documentValid: queryResult.document_type?.eq?.result === true,
                proofData: proofData,
                nullifier: verificationResult.uniqueIdentifier || this.generateNullifier(proofData)
            };

            return result;
        } catch (error) {
            console.error('zkPassport verification failed:', error);
            return { isValid: false };
        }
    }

    /**
     * Check if two users can marry based on their zkPassport proofs
     */
    async canMarry(
        proof1: ZKPassportProofResult,
        proof2: ZKPassportProofResult,
        jurisdiction: {
            minAge?: number;
            sameSexAllowed?: boolean;
        } = {}
    ): Promise<{
        canMarry: boolean;
        reasons: string[];
    }> {
        const reasons: string[] = [];
        const { minAge = 18 } = jurisdiction;

        // Check if both proofs are valid
        if (!proof1.isValid || !proof2.isValid) {
            reasons.push('Invalid zkPassport proof');
            return { canMarry: false, reasons };
        }

        // Check age requirements - must be 18 or older
        if (!proof1.ageOver18 || !proof2.ageOver18) {
            reasons.push(`Both parties must be over 18 years old`);
        }

        // Check document validity
        if (!proof1.documentValid || !proof2.documentValid) {
            reasons.push('Invalid or expired identity documents');
        }

        // Check for duplicate persons (same nullifier)
        if (proof1.nullifier === proof2.nullifier) {
            reasons.push('Cannot marry yourself');
        }

        return {
            canMarry: reasons.length === 0,
            reasons
        };
    }

    /**
     * Generate marriage certificate data from zkPassport proofs
     */
    async generateMarriageCertificateData(
        proof1: ZKPassportProofResult,
        proof2: ZKPassportProofResult,
        marriageId: string
    ): Promise<{
        certificate: any;
        privacy: {
            spouse1Nullifier: string;
            spouse2Nullifier: string;
            marriageProof: any;
        };
    }> {
        if (!proof1.isValid || !proof2.isValid) {
            throw new Error('Both zkPassport proofs must be valid');
        }

        // Generate zero-knowledge marriage certificate (no personal data disclosed)
        const certificate = {
            marriageId,
            timestamp: new Date().toISOString(),
            jurisdiction: 'zkPassport-verified',
            // Zero-knowledge: only verification status, no personal details
            spouse1: {
                ageVerified: proof1.ageOver18 || proof1.ageOver21,
                documentValid: proof1.documentValid,
                zkPassportVerified: true
            },
            spouse2: {
                ageVerified: proof2.ageOver18 || proof2.ageOver21,
                documentValid: proof2.documentValid,
                zkPassportVerified: true
            },
            // Privacy: only cryptographic proofs, no identifiable information
            verificationLevel: 'zero-knowledge'
        };

        // Privacy layer - nullifiers for blockchain verification
        const privacy = {
            spouse1Nullifier: proof1.nullifier!,
            spouse2Nullifier: proof2.nullifier!,
            marriageProof: {
                proof1Hash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(proof1.proofData))),
                proof2Hash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(proof2.proofData))),
                marriageId
            }
        };

        return { certificate, privacy };
    }

    /**
     * Create proof of single status (not married)
     */
    async createSingleStatusProof(
        userId: string,
        zkPassportProof: ZKPassportProofResult
    ): Promise<{
        isValid: boolean;
        singleStatusProof?: any;
        nullifier?: string;
    }> {
        if (!zkPassportProof.isValid) {
            return { isValid: false };
        }

        // Generate proof that this person is not currently married
        // This would typically involve checking against a registry of marriages
        const singleStatusProof = {
            userId,
            nullifier: zkPassportProof.nullifier,
            timestamp: Date.now(),
            status: 'single',
            zkPassportProof: zkPassportProof.proofData
        };

        return {
            isValid: true,
            singleStatusProof,
            nullifier: zkPassportProof.nullifier
        };
    }

    /**
     * Get supported countries by zkPassport
     * Note: All countries are supported as we don't restrict by nationality
     */
    async getSupportedCountries(): Promise<string[]> {
        try {
            // All countries are supported since we removed nationality restrictions
            // This would typically come from the zkPassport SDK for all supported passports
            return [
                'USA', 'CAN', 'GBR', 'DEU', 'FRA', 'ITA', 'ESP', 'NLD', 
                'AUS', 'NZL', 'JPN', 'KOR', 'SGP', 'CHE', 'AUT', 'BEL',
                'DNK', 'FIN', 'ISL', 'IRL', 'LUX', 'NOR', 'PRT', 'SWE',
                'BRA', 'ARG', 'MEX', 'IND', 'CHN', 'RUS', 'ZAF', 'EGY'
                // Add more countries as supported by zkPassport
            ];
        } catch (error) {
            console.error('Failed to get supported countries:', error);
            return [];
        }
    }

    /**
     * Health check for zkPassport service
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        latency?: number;
        error?: string;
    }> {
        try {
            const startTime = Date.now();
            
            // Test the zkPassport service with a simple request
            await this.zkPassport.request({
                name: 'Health Check',
                purpose: 'Service health verification',
                logo: ''
            });

            const latency = Date.now() - startTime;
            
            return {
                status: 'healthy',
                latency
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Generate nullifier for privacy
     */
    private generateNullifier(proofData: any): string {
        // Generate deterministic nullifier from proof data
        const proofHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(proofData)));
        return ethers.keccak256(ethers.solidityPacked(['bytes32', 'string'], [proofHash, 'marriaged']));
    }

    /**
     * Get configuration
     */
    getConfig(): ZKPassportConfig {
        return { ...this.config };
    }
}