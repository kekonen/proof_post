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

        // Setup default jurisdictions and minimum ages
        string[] memory jurisdictions = new string[](5);
        uint256[] memory minimumAges = new uint256[](5);
        
        jurisdictions[0] = "US";
        minimumAges[0] = 18;
        
        jurisdictions[1] = "CA";
        minimumAges[1] = 18;
        
        jurisdictions[2] = "GB";
        minimumAges[2] = 18;
        
        jurisdictions[3] = "EU";
        minimumAges[3] = 18;
        
        jurisdictions[4] = "default";
        minimumAges[4] = 18;

        vm.startBroadcast(deployerPrivateKey);

        // Deploy RealMarriageRegistry
        RealMarriageRegistry marriageRegistry = new RealMarriageRegistry(
            zkPassportVerifier,
            jurisdictions,
            minimumAges
        );

        console.log("RealMarriageRegistry deployed to:", address(marriageRegistry));
        console.log("Owner:", marriageRegistry.owner());
        console.log("ZK Passport Verifier:", marriageRegistry.zkPassportVerifier());
        console.log("Supported jurisdictions:", jurisdictions.length);
        
        // Log supported jurisdictions
        for (uint i = 0; i < jurisdictions.length; i++) {
            console.log("  -", jurisdictions[i], "- Min age:", minimumAges[i]);
        }

        vm.stopBroadcast();
    }
}