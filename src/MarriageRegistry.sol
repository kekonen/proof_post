// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MarriageRegistry is ReentrancyGuard, Ownable {
    struct Marriage {
        bytes32 spouse1Hash;
        bytes32 spouse2Hash;
        uint256 marriageDate;
        bool isActive;
        bytes32 merkleRoot;
    }

    struct MarriageProposal {
        bytes32 proposer;
        bytes32 proposee;
        uint256 timestamp;
        uint256 nonce;
        bool isAccepted;
        bool isExpired;
    }

    mapping(bytes32 => Marriage) public marriages;
    mapping(bytes32 => MarriageProposal) public proposals;
    mapping(bytes32 => bytes32) public personToMarriage; // passport hash -> marriage ID
    mapping(bytes32 => bool) public validPassportHashes;
    
    bytes32 public zkPassportMerkleRoot;
    
    event MarriageProposed(bytes32 indexed proposalId, bytes32 proposer, bytes32 proposee);
    event MarriageCreated(bytes32 indexed marriageId, bytes32 spouse1, bytes32 spouse2);
    event DivorceRequested(bytes32 indexed marriageId, bytes32 requester);
    event MarriageDissolved(bytes32 indexed marriageId);

    constructor(bytes32 _zkPassportMerkleRoot) Ownable(msg.sender) {
        zkPassportMerkleRoot = _zkPassportMerkleRoot;
    }

    function proposeMarriage(
        bytes32 proposalId,
        bytes32 proposee,
        uint256 nonce,
        bytes32[] calldata merkleProof
    ) external {
        require(proposals[proposalId].proposer == bytes32(0), "Proposal already exists");
        require(verifyZKPassport(msg.sender, merkleProof), "Invalid zkPassport proof");
        require(personToMarriage[bytes32(uint256(uint160(msg.sender)))] == bytes32(0), "Already married");

        proposals[proposalId] = MarriageProposal({
            proposer: bytes32(uint256(uint160(msg.sender))),
            proposee: proposee,
            timestamp: block.timestamp,
            nonce: nonce,
            isAccepted: false,
            isExpired: false
        });

        emit MarriageProposed(proposalId, bytes32(uint256(uint160(msg.sender))), proposee);
    }

    function acceptMarriage(
        bytes32 proposalId,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        MarriageProposal storage proposal = proposals[proposalId];
        require(proposal.proposee == bytes32(uint256(uint160(msg.sender))), "Not the proposee");
        require(!proposal.isAccepted, "Already accepted");
        require(!proposal.isExpired, "Proposal expired");
        require(verifyZKPassport(msg.sender, merkleProof), "Invalid zkPassport proof");
        require(personToMarriage[bytes32(uint256(uint160(msg.sender)))] == bytes32(0), "Already married");

        bytes32 marriageId = keccak256(abi.encodePacked(proposal.proposer, proposal.proposee, block.timestamp));
        
        marriages[marriageId] = Marriage({
            spouse1Hash: proposal.proposer,
            spouse2Hash: proposal.proposee,
            marriageDate: block.timestamp,
            isActive: true,
            merkleRoot: generateMarriageMerkleRoot(proposal.proposer, proposal.proposee)
        });

        personToMarriage[proposal.proposer] = marriageId;
        personToMarriage[proposal.proposee] = marriageId;
        proposal.isAccepted = true;

        emit MarriageCreated(marriageId, proposal.proposer, proposal.proposee);
    }

    function requestDivorce(
        bytes32 marriageId,
        bytes32[] calldata merkleProof
    ) external {
        Marriage storage marriage = marriages[marriageId];
        require(marriage.isActive, "Marriage not active");
        
        bytes32 requesterHash = bytes32(uint256(uint160(msg.sender)));
        require(
            marriage.spouse1Hash == requesterHash || marriage.spouse2Hash == requesterHash,
            "Not a spouse in this marriage"
        );
        require(verifyZKPassport(msg.sender, merkleProof), "Invalid zkPassport proof");

        marriage.isActive = false;
        personToMarriage[marriage.spouse1Hash] = bytes32(0);
        personToMarriage[marriage.spouse2Hash] = bytes32(0);

        emit DivorceRequested(marriageId, requesterHash);
        emit MarriageDissolved(marriageId);
    }

    function verifyZKPassport(address user, bytes32[] calldata merkleProof) internal view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(user));
        return verifyMerkleProof(merkleProof, zkPassportMerkleRoot, leaf);
    }

    function verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == root;
    }

    function generateMarriageMerkleRoot(bytes32 spouse1, bytes32 spouse2) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(spouse1, spouse2));
    }

    function getMarriageStatus(address user) external view returns (bool isMarried, bytes32 marriageId) {
        bytes32 userHash = bytes32(uint256(uint160(user)));
        marriageId = personToMarriage[userHash];
        isMarried = marriageId != bytes32(0) && marriages[marriageId].isActive;
    }

    function updateZKPassportMerkleRoot(bytes32 newRoot) external onlyOwner {
        zkPassportMerkleRoot = newRoot;
    }
}