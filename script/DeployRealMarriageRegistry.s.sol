// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/RealMarriageRegistry.sol";

contract DeployRealMarriageRegistry is Script {
    function run() external {
        // Read private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Read zkPassport verifier address from environment
        address zkPassportVerifier;
        try vm.envAddress("ZK_PASSPORT_VERIFIER") returns (address verifier) {
            zkPassportVerifier = verifier;
        } catch {
            // Default mock verifier address for testing
            zkPassportVerifier = address(0x1234567890123456789012345678901234567890);
            console.log("Using default mock zkPassport verifier address");
        }

        vm.startBroadcast(deployerPrivateKey);

        // Deploy RealMarriageRegistry
        RealMarriageRegistry marriageRegistry = new RealMarriageRegistry(
            zkPassportVerifier
        );

        console.log("RealMarriageRegistry deployed to:", address(marriageRegistry));
        console.log("Owner:", marriageRegistry.owner());
        console.log("ZK Passport Verifier:", marriageRegistry.zkPassportVerifier());
        console.log("Minimum age for marriage:", marriageRegistry.getMinimumAge());

        vm.stopBroadcast();
    }
}