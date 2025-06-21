import { MarriageService } from './marriage/MarriageService';
import { ethers } from 'ethers';

// Export main types and classes
export { MarriageService } from './marriage/MarriageService';
export * from './types/marriage';

// Example usage
async function main() {
    console.log('Marriaged - ZK Marriage Proof System');
    console.log('Built on top of zkpassport for privacy-preserving marriage verification');
    
    // This would be replaced with actual provider and contract details
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    const signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider); // test private key
    
    const marriageService = new MarriageService(
        provider,
        '0x' + '0'.repeat(40), // placeholder contract address
        [], // placeholder ABI
        signer
    );

    console.log('Marriage service initialized');
    console.log('Available operations:');
    console.log('- Propose marriage');
    console.log('- Accept marriage proposal');
    console.log('- Generate marriage certificate (ZK proof)');
    console.log('- Generate proof of no marriage');
    console.log('- Request divorce');
    console.log('- Verify marriage status');
}

if (require.main === module) {
    main().catch(console.error);
}