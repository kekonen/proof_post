// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MarriageRegistry.sol";

contract DeployMarriageRegistry is Script {
    function run() external {
        // Read private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Read zkPassport Merkle Root from environment or use default
        bytes32 zkPassportMerkleRoot;
        try vm.envBytes32("ZK_PASSPORT_MERKLE_ROOT") returns (bytes32 root) {
            zkPassportMerkleRoot = root;
        } catch {
            // Default test merkle root - replace with actual zkPassport root in production
            zkPassportMerkleRoot = keccak256("test_merkle_root");
            console.log("Using default test merkle root");
        }

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MarriageRegistry
        MarriageRegistry marriageRegistry = new MarriageRegistry(zkPassportMerkleRoot);

        console.log("MarriageRegistry deployed to:", address(marriageRegistry));
        console.log("Owner:", marriageRegistry.owner());
        console.log("ZK Passport Merkle Root:", vm.toString(marriageRegistry.zkPassportMerkleRoot()));

        vm.stopBroadcast();
    }
}