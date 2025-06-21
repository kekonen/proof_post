// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MarriageRegistry.sol";

contract SetupTestEnvironment is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Create test users
        address alice = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address bob = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address charlie = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

        // Create a simple merkle tree with test users as valid passport holders
        bytes32 aliceLeaf = keccak256(abi.encodePacked(alice));
        bytes32 bobLeaf = keccak256(abi.encodePacked(bob));
        bytes32 charlieLeaf = keccak256(abi.encodePacked(charlie));

        // Simple 2-level merkle tree
        bytes32 leftBranch = keccak256(abi.encodePacked(aliceLeaf, bobLeaf));
        bytes32 rightBranch = keccak256(abi.encodePacked(charlieLeaf, bytes32(0)));
        bytes32 zkPassportMerkleRoot = keccak256(abi.encodePacked(leftBranch, rightBranch));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy with test merkle root
        MarriageRegistry marriageRegistry = new MarriageRegistry(zkPassportMerkleRoot);

        console.log("=== Test Environment Setup ===");
        console.log("MarriageRegistry deployed to:", address(marriageRegistry));
        console.log("ZK Passport Merkle Root:", vm.toString(zkPassportMerkleRoot));
        console.log("");
        console.log("Test Users:");
        console.log("Alice:", alice);
        console.log("Bob:", bob);
        console.log("Charlie:", charlie);
        console.log("");
        console.log("Alice Leaf:", vm.toString(aliceLeaf));
        console.log("Bob Leaf:", vm.toString(bobLeaf));
        console.log("Charlie Leaf:", vm.toString(charlieLeaf));
        console.log("");
        console.log("Use these merkle proofs for testing:");
        console.log("Alice proof elements:");
        console.log("  [0]:", vm.toString(bobLeaf));
        console.log("  [1]:", vm.toString(rightBranch));
        console.log("Bob proof elements:");
        console.log("  [0]:", vm.toString(aliceLeaf));
        console.log("  [1]:", vm.toString(rightBranch));
        console.log("Charlie proof elements:");
        console.log("  [0]:", vm.toString(bytes32(0)));
        console.log("  [1]:", vm.toString(leftBranch));

        vm.stopBroadcast();
    }
}