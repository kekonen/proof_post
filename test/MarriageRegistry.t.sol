// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MarriageRegistry.sol";

contract MarriageRegistryTest is Test {
    MarriageRegistry marriageRegistry;
    address owner;
    address alice;
    address bob;
    address charlie;

    bytes32 zkPassportMerkleRoot;
    bytes32[] aliceMerkleProof;
    bytes32[] bobMerkleProof;
    bytes32[] charlieMerkleProof;

    event MarriageProposed(bytes32 indexed proposalId, bytes32 proposer, bytes32 proposee);
    event MarriageCreated(bytes32 indexed marriageId, bytes32 spouse1, bytes32 spouse2);
    event DivorceRequested(bytes32 indexed marriageId, bytes32 requester);
    event MarriageDissolved(bytes32 indexed marriageId);

    function setUp() public {
        owner = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");

        // Create a simple merkle tree with alice and bob as valid passport holders
        bytes32 aliceLeaf = keccak256(abi.encodePacked(alice));
        bytes32 bobLeaf = keccak256(abi.encodePacked(bob));
        bytes32 charlieLeaf = keccak256(abi.encodePacked(charlie));

        // Build merkle tree following the contract's verification logic
        // Level 1: pair leaves
        bytes32 node1 = aliceLeaf < bobLeaf ? 
            keccak256(abi.encodePacked(aliceLeaf, bobLeaf)) : 
            keccak256(abi.encodePacked(bobLeaf, aliceLeaf));
        bytes32 node2 = charlieLeaf < bytes32(0) ? 
            keccak256(abi.encodePacked(charlieLeaf, bytes32(0))) : 
            keccak256(abi.encodePacked(bytes32(0), charlieLeaf));
        
        // Level 2: combine pairs
        zkPassportMerkleRoot = node1 < node2 ? 
            keccak256(abi.encodePacked(node1, node2)) : 
            keccak256(abi.encodePacked(node2, node1));

        // Alice's proof
        aliceMerkleProof = new bytes32[](2);
        aliceMerkleProof[0] = bobLeaf; // sibling at level 0
        aliceMerkleProof[1] = node2;   // sibling at level 1

        // Bob's proof  
        bobMerkleProof = new bytes32[](2);
        bobMerkleProof[0] = aliceLeaf; // sibling at level 0
        bobMerkleProof[1] = node2;     // sibling at level 1

        // Charlie's proof
        charlieMerkleProof = new bytes32[](2);
        charlieMerkleProof[0] = bytes32(0); // sibling at level 0
        charlieMerkleProof[1] = node1;      // sibling at level 1

        marriageRegistry = new MarriageRegistry(zkPassportMerkleRoot);
    }

    function testProposeMarriage() public {
        vm.startPrank(alice);
        
        bytes32 proposalId = keccak256(abi.encodePacked(alice, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));

        vm.expectEmit(true, false, false, true);
        emit MarriageProposed(proposalId, bytes32(uint256(uint160(alice))), bobHash);

        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        // Verify proposal was created
        (
            bytes32 proposer,
            bytes32 proposee,
            uint256 timestamp,
            uint256 nonce,
            bool isAccepted,
            bool isExpired
        ) = marriageRegistry.proposals(proposalId);

        assertEq(proposer, bytes32(uint256(uint160(alice))));
        assertEq(proposee, bobHash);
        assertEq(nonce, 1);
        assertFalse(isAccepted);
        assertFalse(isExpired);
        assertGt(timestamp, 0);

        vm.stopPrank();
    }

    function testCannotProposeTwice() public {
        vm.startPrank(alice);
        
        bytes32 proposalId = keccak256(abi.encodePacked(alice, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));

        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        vm.expectRevert("Proposal already exists");
        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        vm.stopPrank();
    }

    function testCannotProposeWithoutValidZKPassport() public {
        address invalidUser = makeAddr("invalid");
        vm.startPrank(invalidUser);
        
        bytes32 proposalId = keccak256(abi.encodePacked(invalidUser, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));

        // Use empty proof for invalid user
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.expectRevert("Invalid zkPassport proof");
        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, emptyProof);

        vm.stopPrank();
    }

    function testAcceptMarriage() public {
        // First Alice proposes to Bob
        vm.prank(alice);
        bytes32 proposalId = keccak256(abi.encodePacked(alice, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));
        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        // Then Bob accepts
        vm.startPrank(bob);

        vm.expectEmit(false, true, true, true);
        emit MarriageCreated(bytes32(0), bytes32(uint256(uint160(alice))), bobHash);

        marriageRegistry.acceptMarriage(proposalId, bobMerkleProof);

        // Verify marriage was created
        (bool isMarriedAlice, bytes32 marriageIdAlice) = marriageRegistry.getMarriageStatus(alice);
        (bool isMarriedBob, bytes32 marriageIdBob) = marriageRegistry.getMarriageStatus(bob);

        assertTrue(isMarriedAlice);
        assertTrue(isMarriedBob);
        assertEq(marriageIdAlice, marriageIdBob);

        // Verify marriage details
        (
            bytes32 spouse1Hash,
            bytes32 spouse2Hash,
            uint256 marriageDate,
            bool isActive,
            bytes32 merkleRoot
        ) = marriageRegistry.marriages(marriageIdAlice);

        assertEq(spouse1Hash, bytes32(uint256(uint160(alice))));
        assertEq(spouse2Hash, bobHash);
        assertTrue(isActive);
        assertGt(marriageDate, 0);
        assertNotEq(merkleRoot, bytes32(0));

        vm.stopPrank();
    }

    function testCannotAcceptNonExistentProposal() public {
        vm.prank(bob);
        bytes32 fakeProposalId = keccak256("fake");
        
        vm.expectRevert("Not the proposee");
        marriageRegistry.acceptMarriage(fakeProposalId, bobMerkleProof);
    }

    function testCannotAcceptAsNonProposee() public {
        // Alice proposes to Bob
        vm.prank(alice);
        bytes32 proposalId = keccak256(abi.encodePacked(alice, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));
        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        // Charlie tries to accept
        vm.prank(charlie);
        vm.expectRevert("Not the proposee");
        marriageRegistry.acceptMarriage(proposalId, charlieMerkleProof);
    }

    function testRequestDivorce() public {
        // Setup marriage first
        _createMarriage();

        (bool isMarriedBefore,) = marriageRegistry.getMarriageStatus(alice);
        assertTrue(isMarriedBefore);

        // Alice requests divorce
        vm.startPrank(alice);
        
        bytes32 marriageId = marriageRegistry.personToMarriage(bytes32(uint256(uint160(alice))));

        vm.expectEmit(true, false, false, true);
        emit DivorceRequested(marriageId, bytes32(uint256(uint160(alice))));

        vm.expectEmit(true, false, false, true);
        emit MarriageDissolved(marriageId);

        marriageRegistry.requestDivorce(marriageId, aliceMerkleProof);

        // Verify divorce
        (bool isMarriedAfter,) = marriageRegistry.getMarriageStatus(alice);
        (bool bobMarriedAfter,) = marriageRegistry.getMarriageStatus(bob);
        
        assertFalse(isMarriedAfter);
        assertFalse(bobMarriedAfter);

        // Verify marriage is marked inactive
        (,,, bool isActive,) = marriageRegistry.marriages(marriageId);
        assertFalse(isActive);

        vm.stopPrank();
    }

    function testCannotDivorceNonExistentMarriage() public {
        vm.prank(alice);
        bytes32 fakeMarriageId = keccak256("fake");
        
        vm.expectRevert("Marriage not active");
        marriageRegistry.requestDivorce(fakeMarriageId, aliceMerkleProof);
    }

    function testCannotDivorceAsNonSpouse() public {
        _createMarriage();

        bytes32 marriageId = marriageRegistry.personToMarriage(bytes32(uint256(uint160(alice))));

        vm.prank(charlie);
        vm.expectRevert("Not a spouse in this marriage");
        marriageRegistry.requestDivorce(marriageId, charlieMerkleProof);
    }

    function testCannotMarryWhenAlreadyMarried() public {
        _createMarriage();

        // Alice tries to propose to Charlie while married to Bob
        vm.prank(alice);
        bytes32 proposalId = keccak256(abi.encodePacked(alice, charlie, uint256(2)));
        bytes32 charlieHash = bytes32(uint256(uint160(charlie)));

        vm.expectRevert("Already married");
        marriageRegistry.proposeMarriage(proposalId, charlieHash, 2, aliceMerkleProof);
    }

    function testUpdateZKPassportMerkleRoot() public {
        bytes32 newRoot = keccak256("new root");
        
        marriageRegistry.updateZKPassportMerkleRoot(newRoot);
        
        assertEq(marriageRegistry.zkPassportMerkleRoot(), newRoot);
    }

    function testCannotUpdateZKPassportMerkleRootAsNonOwner() public {
        bytes32 newRoot = keccak256("new root");
        
        vm.prank(alice);
        vm.expectRevert();
        marriageRegistry.updateZKPassportMerkleRoot(newRoot);
    }

    // Helper function to create a marriage between Alice and Bob
    function _createMarriage() internal {
        vm.prank(alice);
        bytes32 proposalId = keccak256(abi.encodePacked(alice, bob, uint256(1)));
        bytes32 bobHash = bytes32(uint256(uint160(bob)));
        marriageRegistry.proposeMarriage(proposalId, bobHash, 1, aliceMerkleProof);

        vm.prank(bob);
        marriageRegistry.acceptMarriage(proposalId, bobMerkleProof);
    }

    function testFuzzProposeMarriage(bytes32 randomProposalId, uint256 randomNonce) public {
        vm.assume(randomProposalId != bytes32(0));
        vm.assume(randomNonce != 0);

        vm.prank(alice);
        bytes32 bobHash = bytes32(uint256(uint160(bob)));
        
        // Should not revert with valid inputs
        marriageRegistry.proposeMarriage(randomProposalId, bobHash, randomNonce, aliceMerkleProof);

        // Verify proposal was created
        (bytes32 proposer,,,,,) = marriageRegistry.proposals(randomProposalId);
        assertEq(proposer, bytes32(uint256(uint160(alice))));
    }
}