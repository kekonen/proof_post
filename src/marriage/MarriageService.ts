import { ethers } from 'ethers';
import { MerkleTree } from 'merkletreejs';
import { Marriage, MarriageProposal, MarriageCertificate, NoMarriageProof, ZKPassportProof } from '../types/marriage';

export class MarriageService {
    private provider: ethers.Provider;
    private contract: ethers.Contract;
    private signer: ethers.Signer;

    constructor(
        provider: ethers.Provider,
        contractAddress: string,
        contractAbi: any[],
        signer: ethers.Signer
    ) {
        this.provider = provider;
        this.contract = new ethers.Contract(contractAddress, contractAbi, signer);
        this.signer = signer;
    }

    async proposeMarriage(
        proposeePassportHash: string,
        zkPassportProof: ZKPassportProof
    ): Promise<string> {
        const nonce = Math.floor(Math.random() * 1000000);
        const proposerAddress = await this.signer.getAddress();
        const proposalId = ethers.keccak256(
            ethers.solidityPacked(
                ['address', 'bytes32', 'uint256'],
                [proposerAddress, proposeePassportHash, nonce]
            )
        );

        const tx = await this.contract.proposeMarriage(
            proposalId,
            proposeePassportHash,
            nonce,
            zkPassportProof.merkleProof
        );

        await tx.wait();
        return proposalId;
    }

    async acceptMarriage(
        proposalId: string,
        zkPassportProof: ZKPassportProof
    ): Promise<string> {
        const tx = await this.contract.acceptMarriage(
            proposalId,
            zkPassportProof.merkleProof
        );

        const receipt = await tx.wait();
        const marriageCreatedEvent = receipt.logs.find(
            (log: any) => log.fragment?.name === 'MarriageCreated'
        );

        if (!marriageCreatedEvent) {
            throw new Error('Marriage creation failed');
        }

        return marriageCreatedEvent.args[0]; // marriageId
    }

    async generateMarriageCertificate(
        marriageId: string,
        zkPassportProof: ZKPassportProof
    ): Promise<MarriageCertificate> {
        const marriage = await this.contract.marriages(marriageId);
        if (!marriage.isActive) {
            throw new Error('Marriage is not active');
        }

        // Build merkle tree for marriage privacy
        const marriageLeaves = [marriage.spouse1Hash, marriage.spouse2Hash];
        const marriageTree = new MerkleTree(
            marriageLeaves.map(leaf => Buffer.from(leaf.slice(2), 'hex')),
            (data: any) => Buffer.from(ethers.keccak256(data).slice(2), 'hex')
        );

        const userPassportHash = zkPassportProof.passportHash;
        const leafIndex = marriageLeaves.findIndex(leaf => leaf === userPassportHash);
        
        if (leafIndex === -1) {
            throw new Error('User is not part of this marriage');
        }

        const merkleProof = marriageTree.getProof(Buffer.from(userPassportHash.slice(2), 'hex'))
            .map(proof => '0x' + proof.data.toString('hex'));

        // Generate ZK proof for marriage certificate
        const circuitInputs = {
            passportHash: userPassportHash,
            marriageId: marriageId,
            spouseHash: marriageLeaves[1 - leafIndex], // other spouse
            merkleProof: merkleProof,
            merkleIndices: marriageTree.getProof(Buffer.from(userPassportHash.slice(2), 'hex'))
                .map(proof => proof.position === 'right' ? 1 : 0),
            marriageMerkleRoot: '0x' + marriageTree.getRoot().toString('hex'),
            nullifierHash: this.generateNullifier(userPassportHash, Date.now()),
            timestamp: Date.now()
        };

        // This would call the actual ZK circuit to generate the proof
        const zkProof = await this.generateZKProof('marriage_proof', circuitInputs);

        return {
            marriageId,
            proof: zkProof.proof,
            publicSignals: zkProof.publicSignals,
            merkleProof
        };
    }

    async generateNoMarriageProof(
        zkPassportProof: ZKPassportProof
    ): Promise<NoMarriageProof> {
        const userAddress = await this.signer.getAddress();
        const marriageStatus = await this.contract.getMarriageStatus(userAddress);
        
        if (marriageStatus.isMarried) {
            throw new Error('User is currently married');
        }

        const timestamp = Date.now();
        const nullifierHash = this.generateNullifier(zkPassportProof.passportHash, timestamp);

        // Generate ZK proof for single status
        const circuitInputs = {
            passportHash: zkPassportProof.passportHash,
            merkleProof: zkPassportProof.merkleProof,
            merkleIndices: zkPassportProof.merkleProof.map(() => 0), // simplified
            zkPassportMerkleRoot: zkPassportProof.merkleRoot,
            marriageRegistryRoot: ethers.ZeroHash, // empty for single status
            nullifierHash,
            timestamp
        };

        const zkProof = await this.generateZKProof('no_marriage_proof', circuitInputs);

        return {
            passportHash: zkPassportProof.passportHash,
            proof: zkProof.proof,
            publicSignals: zkProof.publicSignals,
            merkleProof: zkPassportProof.merkleProof,
            timestamp
        };
    }

    async requestDivorce(
        marriageId: string,
        zkPassportProof: ZKPassportProof
    ): Promise<void> {
        const tx = await this.contract.requestDivorce(
            marriageId,
            zkPassportProof.merkleProof
        );

        await tx.wait();
    }

    async getMarriageStatus(address: string): Promise<{ isMarried: boolean; marriageId: string }> {
        return await this.contract.getMarriageStatus(address);
    }

    private generateNullifier(passportHash: string, timestamp: number): string {
        return ethers.keccak256(
            ethers.solidityPacked(['bytes32', 'uint256'], [passportHash, timestamp])
        );
    }

    private async generateZKProof(circuitName: string, inputs: any): Promise<any> {
        // This is a placeholder for actual ZK proof generation
        // In a real implementation, this would use snarkjs to generate proofs
        // from the compiled circuits
        
        console.log(`Generating ZK proof for ${circuitName} with inputs:`, inputs);
        
        // Mock proof structure
        return {
            proof: {
                pi_a: ["0x1", "0x2", "0x1"],
                pi_b: [["0x1", "0x2"], ["0x3", "0x4"], ["0x1", "0x1"]],
                pi_c: ["0x1", "0x2", "0x1"],
                protocol: "groth16",
                curve: "bn128"
            },
            publicSignals: Object.values(inputs).filter(v => 
                typeof v === 'string' || typeof v === 'number'
            ).map(String)
        };
    }

    async verifyMarriageCertificate(certificate: MarriageCertificate): Promise<boolean> {
        // This would verify the ZK proof using the verifier contract
        // For now, we'll do a basic check
        return !!(certificate.proof && certificate.publicSignals.length > 0);
    }

    async verifyNoMarriageProof(proof: NoMarriageProof): Promise<boolean> {
        // This would verify the ZK proof using the verifier contract
        return !!(proof.proof && proof.publicSignals.length > 0);
    }
}