import { RealZKPassportService } from '../zkpassport/RealZKPassportService';

describe('RealZKPassportService', () => {
    let zkPassportService: RealZKPassportService;

    beforeEach(() => {
        const config = {
            domain: 'test.marriaged.app',
            environment: 'development' as const,
            appName: 'Marriaged Test',
            appLogo: 'https://test.marriaged.app/logo.png'
        };
        
        zkPassportService = new RealZKPassportService(config);
    });

    describe('initialization', () => {
        it('should create RealZKPassportService instance', () => {
            expect(zkPassportService).toBeInstanceOf(RealZKPassportService);
        });

        it('should have correct configuration', () => {
            const config = zkPassportService.getConfig();
            expect(config.domain).toBe('test.marriaged.app');
            expect(config.environment).toBe('development');
            expect(config.appName).toBe('Marriaged Test');
        });
    });

    describe('createMarriageVerificationRequest', () => {
        it('should create verification request with default requirements', async () => {
            const request = await zkPassportService.createMarriageVerificationRequest('user123');
            
            expect(request.requestId).toBeDefined();
            expect(request.verificationUrl).toBeDefined();
            expect(request.expiresAt).toBeInstanceOf(Date);
            expect(request.requiredAttributes).toContain('firstname');
            expect(request.requiredAttributes).toContain('lastname');
            expect(request.requiredAttributes).toContain('birthdate');
            expect(request.requiredAttributes).toContain('document_type');
        });

        it('should create verification request with custom requirements', async () => {
            const requirements = {
                minAge: 21,
                allowedCountries: ['USA', 'CAN'],
                requireDocumentValidity: true
            };
            
            const request = await zkPassportService.createMarriageVerificationRequest('user123', requirements);
            
            expect(request.requiredAttributes).toContain('firstname');
            expect(request.requiredAttributes).toContain('lastname');
            expect(request.requiredAttributes).toContain('birthdate');
            expect(request.requiredAttributes).toContain('document_type');
            expect(request.requiredAttributes).toContain('nationality');
        });

        it('should generate unique request IDs', async () => {
            const request1 = await zkPassportService.createMarriageVerificationRequest('user123');
            const request2 = await zkPassportService.createMarriageVerificationRequest('user123');
            
            expect(request1.requestId).not.toBe(request2.requestId);
        });
    });

    describe('verifyProof', () => {
        it('should verify valid proof', async () => {
            const mockProofData = {
                proofs: [{ proof: 'mock-proof-data' }],
                queryResult: {
                    age: {
                        gte: {
                            expected: 18,
                            result: true
                        }
                    },
                    nationality: {
                        disclose: {
                            result: 'USA'
                        }
                    },
                    document_type: {
                        eq: {
                            result: true
                        }
                    },
                    firstname: {
                        disclose: {
                            result: 'John'
                        }
                    },
                    lastname: {
                        disclose: {
                            result: 'Doe'
                        }
                    }
                }
            };

            // Mock the zkPassport.verify method to return successful verification
            const originalVerify = (zkPassportService as any).zkPassport.verify;
            (zkPassportService as any).zkPassport.verify = jest.fn().mockResolvedValue({
                uniqueIdentifier: '0x' + '1'.repeat(64),
                verified: true
            });

            const result = await zkPassportService.verifyProof(mockProofData);

            expect(result.isValid).toBe(true);
            expect(result.nationality).toBe('USA');
            expect(result.ageOver18).toBe(true);
            expect(result.documentValid).toBe(true);
            expect(result.nullifier).toBeDefined();

            // Restore original method
            (zkPassportService as any).zkPassport.verify = originalVerify;
        });

        it('should reject invalid proof', async () => {
            const mockProofData = {
                disclosed: {
                    age_over_18: false,
                    nationality: 'USA'
                }
            };

            // Mock the zkPassport.verify method to return false
            const originalVerify = (zkPassportService as any).zkPassport.verify;
            (zkPassportService as any).zkPassport.verify = jest.fn().mockResolvedValue(false);

            const result = await zkPassportService.verifyProof(mockProofData);

            expect(result.isValid).toBe(false);

            // Restore original method
            (zkPassportService as any).zkPassport.verify = originalVerify;
        });

        it('should handle verification errors gracefully', async () => {
            const mockProofData = { invalid: 'data' };

            // Mock the zkPassport.verify method to throw an error
            const originalVerify = (zkPassportService as any).zkPassport.verify;
            (zkPassportService as any).zkPassport.verify = jest.fn().mockRejectedValue(new Error('Verification failed'));

            const result = await zkPassportService.verifyProof(mockProofData);

            expect(result.isValid).toBe(false);

            // Restore original method
            (zkPassportService as any).zkPassport.verify = originalVerify;
        });
    });

    describe('canMarry', () => {
        const validProof1 = {
            isValid: true,
            nationality: 'USA',
            ageOver18: true,
            ageOver21: true,
            documentValid: true,
            nullifier: '0x' + '1'.repeat(64)
        };

        const validProof2 = {
            isValid: true,
            nationality: 'CAN',
            ageOver18: true,
            ageOver21: true,
            documentValid: true,
            nullifier: '0x' + '2'.repeat(64)
        };

        it('should allow marriage with valid proofs', async () => {
            const result = await zkPassportService.canMarry(validProof1, validProof2);
            
            expect(result.canMarry).toBe(true);
            expect(result.reasons).toHaveLength(0);
        });

        it('should reject marriage with invalid proofs', async () => {
            const invalidProof = { ...validProof1, isValid: false };
            
            const result = await zkPassportService.canMarry(invalidProof, validProof2);
            
            expect(result.canMarry).toBe(false);
            expect(result.reasons).toContain('Invalid zkPassport proof');
        });

        it('should reject marriage with age restrictions', async () => {
            const underageProof = { ...validProof1, ageOver18: false };
            const jurisdiction = { minAge: 18 };
            
            const result = await zkPassportService.canMarry(underageProof, validProof2, jurisdiction);
            
            expect(result.canMarry).toBe(false);
            expect(result.reasons).toContain('Both parties must be over 18 years old');
        });

        it('should reject marriage with nationality restrictions', async () => {
            const jurisdiction = { allowedCountries: ['GBR', 'DEU'] };
            
            const result = await zkPassportService.canMarry(validProof1, validProof2, jurisdiction);
            
            expect(result.canMarry).toBe(false);
            expect(result.reasons.length).toBeGreaterThan(0);
        });

        it('should reject marriage with same nullifier', async () => {
            const sameNullifierProof = { ...validProof2, nullifier: validProof1.nullifier };
            
            const result = await zkPassportService.canMarry(validProof1, sameNullifierProof);
            
            expect(result.canMarry).toBe(false);
            expect(result.reasons).toContain('Cannot marry yourself');
        });

        it('should reject marriage with invalid documents', async () => {
            const invalidDocProof = { ...validProof1, documentValid: false };
            
            const result = await zkPassportService.canMarry(invalidDocProof, validProof2);
            
            expect(result.canMarry).toBe(false);
            expect(result.reasons).toContain('Invalid or expired identity documents');
        });
    });

    describe('generateMarriageCertificateData', () => {
        const validProof1 = {
            isValid: true,
            nationality: 'USA',
            ageOver18: true,
            documentValid: true,
            nullifier: '0x' + '1'.repeat(64),
            proofData: {
                queryResult: {
                    firstname: {
                        disclose: {
                            result: 'John'
                        }
                    },
                    lastname: {
                        disclose: {
                            result: 'Doe'
                        }
                    }
                }
            }
        };

        const validProof2 = {
            isValid: true,
            nationality: 'CAN',
            ageOver18: true,
            documentValid: true,
            nullifier: '0x' + '2'.repeat(64),
            proofData: {
                queryResult: {
                    firstname: {
                        disclose: {
                            result: 'Jane'
                        }
                    },
                    lastname: {
                        disclose: {
                            result: 'Smith'
                        }
                    }
                }
            }
        };

        it('should generate marriage certificate data', async () => {
            const marriageId = '0x' + '3'.repeat(64);
            
            const result = await zkPassportService.generateMarriageCertificateData(
                validProof1,
                validProof2,
                marriageId
            );
            
            expect(result.certificate).toBeDefined();
            expect(result.certificate.marriageId).toBe(marriageId);
            expect(result.certificate.spouse1.firstname).toBe('John');
            expect(result.certificate.spouse2.firstname).toBe('Jane');
            
            expect(result.privacy).toBeDefined();
            expect(result.privacy.spouse1Nullifier).toBe(validProof1.nullifier);
            expect(result.privacy.spouse2Nullifier).toBe(validProof2.nullifier);
        });

        it('should reject invalid proofs', async () => {
            const invalidProof = { ...validProof1, isValid: false };
            const marriageId = '0x' + '3'.repeat(64);
            
            await expect(zkPassportService.generateMarriageCertificateData(
                invalidProof,
                validProof2,
                marriageId
            )).rejects.toThrow('Both zkPassport proofs must be valid');
        });
    });

    describe('createSingleStatusProof', () => {
        it('should create single status proof', async () => {
            const validProof = {
                isValid: true,
                nullifier: '0x' + '1'.repeat(64),
                proofData: { test: 'data' }
            };
            
            const result = await zkPassportService.createSingleStatusProof('user123', validProof);
            
            expect(result.isValid).toBe(true);
            expect(result.singleStatusProof).toBeDefined();
            expect(result.singleStatusProof.status).toBe('single');
            expect(result.nullifier).toBe(validProof.nullifier);
        });

        it('should reject invalid proof', async () => {
            const invalidProof = { isValid: false };
            
            const result = await zkPassportService.createSingleStatusProof('user123', invalidProof as any);
            
            expect(result.isValid).toBe(false);
        });
    });

    describe('getSupportedCountries', () => {
        it('should return supported countries', async () => {
            const countries = await zkPassportService.getSupportedCountries();
            
            expect(Array.isArray(countries)).toBe(true);
            expect(countries.length).toBeGreaterThan(0);
            expect(countries).toContain('USA');
            expect(countries).toContain('CAN');
            expect(countries).toContain('GBR');
        });
    });

    describe('healthCheck', () => {
        it('should return healthy status', async () => {
            // Mock the zkPassport.request method to succeed
            const originalRequest = (zkPassportService as any).zkPassport.request;
            (zkPassportService as any).zkPassport.request = jest.fn().mockResolvedValue({ url: 'test-url' });

            const result = await zkPassportService.healthCheck();

            expect(result.status).toBe('healthy');
            expect(result.latency).toBeDefined();

            // Restore original method
            (zkPassportService as any).zkPassport.request = originalRequest;
        });

        it('should return unhealthy status on error', async () => {
            // Mock the zkPassport.request method to fail
            const originalRequest = (zkPassportService as any).zkPassport.request;
            (zkPassportService as any).zkPassport.request = jest.fn().mockRejectedValue(new Error('Service unavailable'));

            const result = await zkPassportService.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.error).toBeDefined();

            // Restore original method
            (zkPassportService as any).zkPassport.request = originalRequest;
        });
    });
});