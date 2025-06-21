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
            allowedCountries?: string[];
            requireDocumentValidity?: boolean;
        } = {}
    ): Promise<MarriageVerificationRequest> {
        const {
            minAge = 18,
            allowedCountries = [],
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

            // Age verification - use constraints on age field instead of disclosure
            if (minAge >= 18) {
                builder = builder.gte('age', minAge);
            }

            // Nationality verification
            if (allowedCountries.length > 0) {
                builder = builder.disclose('nationality');
                if (allowedCountries.length > 0) {
                    builder = builder.in('nationality', allowedCountries as any);
                }
            }

            // Document type verification (passport)
            builder = builder.disclose('document_type');
            builder = builder.eq('document_type', 'passport');

            // Additional attributes for marriage verification
            builder = builder
                .disclose('firstname')  // For marriage certificate
                .disclose('lastname')   // For marriage certificate
                .disclose('birthdate'); // For age verification backup

            const { url } = builder.done();

            const requestId = ethers.keccak256(
                ethers.solidityPacked(['string', 'uint256', 'uint256'], [userId, Date.now(), Math.floor(Math.random() * 1000000)])
            );

            return {
                requestId,
                verificationUrl: url,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                requiredAttributes: [
                    'firstname',
                    'lastname',
                    'birthdate',
                    'document_type',
                    ...allowedCountries.length > 0 ? ['nationality'] : []
                ].filter(Boolean)
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
            allowedCountries?: string[];
            sameSexAllowed?: boolean;
        } = {}
    ): Promise<{
        canMarry: boolean;
        reasons: string[];
    }> {
        const reasons: string[] = [];
        const { minAge = 18, allowedCountries = [] } = jurisdiction;

        // Check if both proofs are valid
        if (!proof1.isValid || !proof2.isValid) {
            reasons.push('Invalid zkPassport proof');
            return { canMarry: false, reasons };
        }

        // Check age requirements
        if (minAge >= 21) {
            if (!proof1.ageOver21 || !proof2.ageOver21) {
                reasons.push(`Both parties must be over 21 years old`);
            }
        } else if (minAge >= 18) {
            if (!proof1.ageOver18 || !proof2.ageOver18) {
                reasons.push(`Both parties must be over 18 years old`);
            }
        }

        // Check nationality restrictions
        if (allowedCountries.length > 0) {
            if (!proof1.nationality || !allowedCountries.includes(proof1.nationality)) {
                reasons.push(`First party nationality not allowed in this jurisdiction`);
            }
            if (!proof2.nationality || !allowedCountries.includes(proof2.nationality)) {
                reasons.push(`Second party nationality not allowed in this jurisdiction`);
            }
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

        // Generate privacy-preserving marriage certificate
        const certificate = {
            marriageId,
            timestamp: new Date().toISOString(),
            jurisdiction: 'zkPassport-verified',
            // Personal details are only included if disclosed in zkPassport proof
            spouse1: {
                firstname: proof1.proofData?.queryResult?.firstname?.disclose?.result,
                lastname: proof1.proofData?.queryResult?.lastname?.disclose?.result,
                nationality: proof1.nationality,
                ageVerified: proof1.ageOver18 || proof1.ageOver21,
                documentValid: proof1.documentValid
            },
            spouse2: {
                firstname: proof2.proofData?.queryResult?.firstname?.disclose?.result,
                lastname: proof2.proofData?.queryResult?.lastname?.disclose?.result,
                nationality: proof2.nationality,
                ageVerified: proof2.ageOver18 || proof2.ageOver21,
                documentValid: proof2.documentValid
            }
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
     */
    async getSupportedCountries(): Promise<string[]> {
        try {
            // This would typically come from the zkPassport SDK
            // For now, return common supported countries
            return [
                'USA', 'CAN', 'GBR', 'DEU', 'FRA', 'ITA', 'ESP', 'NLD', 
                'AUS', 'NZL', 'JPN', 'KOR', 'SGP', 'CHE', 'AUT', 'BEL',
                'DNK', 'FIN', 'ISL', 'IRL', 'LUX', 'NOR', 'PRT', 'SWE'
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