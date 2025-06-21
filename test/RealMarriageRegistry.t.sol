// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/RealMarriageRegistry.sol";

contract RealMarriageRegistryTest is Test {
    RealMarriageRegistry registry;
    address owner;
    address zkPassportVerifier;
    address alice;
    address bob;
    
    event MarriageProposed(
        bytes32 indexed proposalId, 
        bytes32 proposerNullifier, 
        bytes32 proposeeNullifier,
        string jurisdiction
    );
    
    event MarriageCreated(
        bytes32 indexed marriageId, 
        bytes32 spouse1Nullifier, 
        bytes32 spouse2Nullifier,
        string jurisdiction
    );
    
    event DivorceRequested(bytes32 indexed marriageId, bytes32 requesterNullifier);
    event MarriageDissolved(bytes32 indexed marriageId);
    event ZKPassportVerifierUpdated(address newVerifier);

    function setUp() public {
        owner = address(this);
        zkPassportVerifier = address(0x1234567890123456789012345678901234567890);
        alice = address(0x1);
        bob = address(0x2);
        
        // Deploy registry
        registry = new RealMarriageRegistry(
            zkPassportVerifier
        );
    }
    
    function testInitialization() public {
        assertEq(registry.owner(), owner);
        assertEq(registry.zkPassportVerifier(), zkPassportVerifier);
        
        // Test minimum age (now a constant)
        assertEq(registry.getMinimumAge(), 18);
    }
    
    function testCreateMarriageProposal() public {
        bytes32 proposalId = keccak256("proposal1");
        bytes32 proposerNullifier = keccak256("alice_nullifier");
        bytes32 proposeeNullifier = keccak256("bob_nullifier");
        bytes32 proposalHash = keccak256("proposal_hash");
        uint256 expirationTime = block.timestamp + 1 days;
        string memory jurisdiction = "US";
        
        // Create valid zkPassport proofs that will pass the mock verification
        bytes32 proofHash1 = keccak256("alice_proof");
        bytes32 derivedNullifier1 = keccak256(abi.encodePacked(proofHash1, "nullifier"));
        bytes memory zkProof1 = "alice_proof";
        
        bytes32 proofHash2 = keccak256("bob_proof");  
        bytes32 derivedNullifier2 = keccak256(abi.encodePacked(proofHash2, "nullifier"));
        bytes memory zkProof2 = "bob_proof";
        
        // The contract will derive nullifiers from the proofs, so we need to use the derived ones
        proposerNullifier = derivedNullifier1;
        proposeeNullifier = derivedNullifier2;
        
        // Expect event emission
        vm.expectEmit(true, true, true, true);
        emit MarriageProposed(proposalId, proposerNullifier, proposeeNullifier, jurisdiction);
        
        // Create proposal
        registry.createMarriageProposal(
            proposalId,
            proposerNullifier,
            proposeeNullifier,
            proposalHash,
            expirationTime,
            jurisdiction,
            zkProof1,
            zkProof2
        );
        
        // Verify proposal was created - test key fields individually to avoid stack too deep
        (bytes32 storedProposerNullifier,,,,,,,) = registry.proposals(proposalId);
        assertEq(storedProposerNullifier, proposerNullifier);
        
        (,bytes32 storedProposeeNullifier,,,,,,) = registry.proposals(proposalId);
        assertEq(storedProposeeNullifier, proposeeNullifier);
        
        (,,bytes32 storedProposalHash,,,,,) = registry.proposals(proposalId);
        assertEq(storedProposalHash, proposalHash);
        
        (,,,,,bool isAccepted,,) = registry.proposals(proposalId);
        assertFalse(isAccepted);
    }
    
    function testCreateMarriageProposalWithAnyJurisdiction() public {
        bytes32 proposalId = keccak256("proposal1");
        bytes32 proposerNullifier = keccak256("alice_nullifier");
        bytes32 proposeeNullifier = keccak256("bob_nullifier");
        bytes32 proposalHash = keccak256("proposal_hash");
        uint256 expirationTime = block.timestamp + 1 days;
        string memory jurisdiction = "ANY_JURISDICTION"; // Any jurisdiction should work now
        
        // Create valid zkPassport proofs that will pass the mock verification
        bytes32 proofHash1 = keccak256("alice_proof");
        bytes32 derivedNullifier1 = keccak256(abi.encodePacked(proofHash1, "nullifier"));
        bytes memory zkProof1 = "alice_proof";
        
        bytes32 proofHash2 = keccak256("bob_proof");  
        bytes32 derivedNullifier2 = keccak256(abi.encodePacked(proofHash2, "nullifier"));
        bytes memory zkProof2 = "bob_proof";
        
        // Use derived nullifiers
        proposerNullifier = derivedNullifier1;
        proposeeNullifier = derivedNullifier2;
        
        // Should succeed with any jurisdiction
        registry.createMarriageProposal(
            proposalId,
            proposerNullifier,
            proposeeNullifier,
            proposalHash,
            expirationTime,
            jurisdiction,
            zkProof1,
            zkProof2
        );
        
        // Verify proposal was created
        (bytes32 storedProposerNullifier,,,,,,,) = registry.proposals(proposalId);
        assertEq(storedProposerNullifier, proposerNullifier);
    }
    
    function testCreateMarriageProposalFailsWithUsedNullifier() public {
        bytes32 proposalId1 = keccak256("proposal1");
        bytes32 proposalId2 = keccak256("proposal2");
        bytes32 proposerNullifier = keccak256("alice_nullifier");
        bytes32 proposeeNullifier1 = keccak256("bob_nullifier");
        bytes32 proposeeNullifier2 = keccak256("charlie_nullifier");
        bytes32 proposalHash = keccak256("proposal_hash");
        uint256 expirationTime = block.timestamp + 1 days;
        string memory jurisdiction = "US";
        
        bytes memory zkProof1 = abi.encodePacked("alice_proof");
        bytes memory zkProof2 = abi.encodePacked("bob_proof");
        bytes memory zkProof3 = abi.encodePacked("charlie_proof");
        
        // First proposal should succeed
        registry.createMarriageProposal(
            proposalId1,
            proposerNullifier,
            proposeeNullifier1,
            proposalHash,
            expirationTime,
            jurisdiction,
            zkProof1,
            zkProof2
        );
        
        // Second proposal with same proposer nullifier should fail
        vm.expectRevert(RealMarriageRegistry.NullifierAlreadyUsed.selector);
        registry.createMarriageProposal(
            proposalId2,
            proposerNullifier, // Same nullifier
            proposeeNullifier2,
            proposalHash,
            expirationTime,
            jurisdiction,
            zkProof1,
            zkProof3
        );
    }
    
    function testAcceptMarriage() public {
        // First create a proposal
        bytes32 proposalId = keccak256("proposal1");
        bytes32 proposerNullifier = keccak256("alice_nullifier");
        bytes32 proposeeNullifier = keccak256("bob_nullifier");
        bytes32 proposalHash = keccak256("proposal_hash");
        uint256 expirationTime = block.timestamp + 1 days;
        string memory jurisdiction = "US";
        bytes32 certificateHash = keccak256("certificate");
        
        bytes memory zkProof1 = abi.encodePacked("alice_proof");
        bytes memory zkProof2 = abi.encodePacked("bob_proof");
        
        registry.createMarriageProposal(
            proposalId,
            proposerNullifier,
            proposeeNullifier,
            proposalHash,
            expirationTime,
            jurisdiction,
            zkProof1,
            zkProof2
        );
        
        // Accept the marriage
        vm.expectEmit(true, true, true, true);
        emit MarriageCreated(
            keccak256(abi.encodePacked(proposerNullifier, proposeeNullifier, block.timestamp, jurisdiction)),
            proposerNullifier,
            proposeeNullifier,
            jurisdiction
        );
        
        registry.acceptMarriage(proposalId, certificateHash);
        
        // Verify marriage was created
        bytes32 expectedMarriageId = keccak256(abi.encodePacked(
            proposerNullifier,
            proposeeNullifier,
            block.timestamp,
            jurisdiction
        ));
        
        (
            bytes32 spouse1Nullifier,
            bytes32 spouse2Nullifier,
            uint256 marriageDate,
            bool isActive,
            string memory marriageJurisdiction
        ) = registry.getMarriage(expectedMarriageId);
        
        assertEq(spouse1Nullifier, proposerNullifier);
        assertEq(spouse2Nullifier, proposeeNullifier);
        assertEq(marriageDate, block.timestamp);
        assertTrue(isActive);
        assertEq(marriageJurisdiction, jurisdiction);
        
        // Verify nullifiers are now used
        assertTrue(registry.isNullifierUsed(proposerNullifier));
        assertTrue(registry.isNullifierUsed(proposeeNullifier));
    }
    
    function testCreateMarriageDirectly() public {
        bytes32 marriageId = keccak256("marriage1");
        bytes32 spouse1Nullifier = keccak256("alice_nullifier");
        bytes32 spouse2Nullifier = keccak256("bob_nullifier");
        bytes32 proof1Hash = keccak256("proof1");
        bytes32 proof2Hash = keccak256("proof2");
        
        vm.expectEmit(true, true, true, true);
        emit MarriageCreated(marriageId, spouse1Nullifier, spouse2Nullifier, "default");
        
        registry.createMarriage(
            marriageId,
            spouse1Nullifier,
            spouse2Nullifier,
            proof1Hash,
            proof2Hash
        );
        
        // Verify marriage
        (
            bytes32 storedSpouse1,
            bytes32 storedSpouse2,
            uint256 marriageDate,
            bool isActive,
            string memory jurisdiction
        ) = registry.getMarriage(marriageId);
        
        assertEq(storedSpouse1, spouse1Nullifier);
        assertEq(storedSpouse2, spouse2Nullifier);
        assertEq(marriageDate, block.timestamp);
        assertTrue(isActive);
        assertEq(jurisdiction, "default");
    }
    
    function testRequestDivorce() public {
        // Create a marriage first
        bytes32 marriageId = keccak256("marriage1");
        bytes32 spouse1Nullifier = keccak256("alice_nullifier");
        bytes32 spouse2Nullifier = keccak256("bob_nullifier");
        bytes32 proof1Hash = keccak256("proof1");
        bytes32 proof2Hash = keccak256("proof2");
        
        registry.createMarriage(
            marriageId,
            spouse1Nullifier,
            spouse2Nullifier,
            proof1Hash,
            proof2Hash
        );
        
        // Request divorce
        vm.expectEmit(true, true, true, true);
        emit DivorceRequested(marriageId, spouse1Nullifier);
        vm.expectEmit(true, true, true, true);
        emit MarriageDissolved(marriageId);
        
        registry.requestDivorce(marriageId, spouse1Nullifier);
        
        // Verify marriage is dissolved
        (,, uint256 marriageDate, bool isActive,) = registry.getMarriage(marriageId);
        assertFalse(isActive);
        
        // Verify nullifiers are cleared
        assertEq(registry.nullifierToMarriage(spouse1Nullifier), bytes32(0));
        assertEq(registry.nullifierToMarriage(spouse2Nullifier), bytes32(0));
    }
    
    function testGetMarriageStatusByNullifier() public {
        bytes32 marriageId = keccak256("marriage1");
        bytes32 spouse1Nullifier = keccak256("alice_nullifier");
        bytes32 spouse2Nullifier = keccak256("bob_nullifier");
        bytes32 proof1Hash = keccak256("proof1");
        bytes32 proof2Hash = keccak256("proof2");
        
        // Before marriage
        (bool isMarried, bytes32 returnedMarriageId, uint256 marriageDate) = 
            registry.getMarriageStatusByNullifier(spouse1Nullifier);
        assertFalse(isMarried);
        assertEq(returnedMarriageId, bytes32(0));
        assertEq(marriageDate, 0);
        
        // Create marriage
        registry.createMarriage(
            marriageId,
            spouse1Nullifier,
            spouse2Nullifier,
            proof1Hash,
            proof2Hash
        );
        
        // After marriage
        (isMarried, returnedMarriageId, marriageDate) = 
            registry.getMarriageStatusByNullifier(spouse1Nullifier);
        assertTrue(isMarried);
        assertEq(returnedMarriageId, marriageId);
        assertEq(marriageDate, block.timestamp);
    }
    
    function testVerifyMarriageCertificate() public {
        bytes32 marriageId = keccak256("marriage1");
        bytes32 spouse1Nullifier = keccak256("alice_nullifier");
        bytes32 spouse2Nullifier = keccak256("bob_nullifier");
        bytes32 proof1Hash = keccak256("proof1");
        bytes32 proof2Hash = keccak256("proof2");
        
        registry.createMarriage(
            marriageId,
            spouse1Nullifier,
            spouse2Nullifier,
            proof1Hash,
            proof2Hash
        );
        
        // Get certificate hash from the marriage
        (, bytes32 certificateHash) = abi.decode(
            abi.encode(keccak256(abi.encodePacked(marriageId, block.timestamp))),
            (bytes32, bytes32)
        );
        certificateHash = keccak256(abi.encodePacked(marriageId, block.timestamp));
        
        // Verify certificate for spouse1
        assertTrue(registry.verifyMarriageCertificate(
            marriageId,
            certificateHash,
            spouse1Nullifier
        ));
        
        // Verify certificate for spouse2
        assertTrue(registry.verifyMarriageCertificate(
            marriageId,
            certificateHash,
            spouse2Nullifier
        ));
        
        // Should fail for non-spouse
        bytes32 randomNullifier = keccak256("random");
        assertFalse(registry.verifyMarriageCertificate(
            marriageId,
            certificateHash,
            randomNullifier
        ));
    }
    
    function testAdminFunctions() public {
        // Test updating zkPassport verifier
        address newVerifier = address(0x9999);
        vm.expectEmit(true, true, true, true);
        emit ZKPassportVerifierUpdated(newVerifier);
        registry.updateZKPassportVerifier(newVerifier);
        
        assertEq(registry.zkPassportVerifier(), newVerifier);
        
        // Test minimum age is constant
        assertEq(registry.getMinimumAge(), 18);
    }
    
    function testAdminFunctionsOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        registry.updateZKPassportVerifier(address(0x9999));
    }
}