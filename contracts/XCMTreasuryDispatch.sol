// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable.sol";

address constant XCM_PRECOMPILE = 0x00000000000000000000000000000000000a0000;

interface IXcm {
    struct Weight { uint64 refTime; uint64 proofSize; }
    function execute(bytes calldata message, Weight calldata weight) external;
    function send(bytes calldata destination, bytes calldata message) external;
    function weighMessage(bytes calldata message) external view returns (Weight memory);
}

contract XCMTreasuryDispatch is Ownable {
    IXcm constant xcm = IXcm(XCM_PRECOMPILE);
    address public treasury;
    uint256 public totalDispatched;
    event TreasuryXcmDispatched(bytes xcmMessage, uint64 refTime, uint64 proofSize, uint256 timestamp);
    event TreasuryUpdated(address indexed old, address indexed next);

    constructor(address _treasury) { treasury = _treasury; }

    function weighTreasuryMessage(bytes calldata msg_) external view returns (IXcm.Weight memory) {
        return xcm.weighMessage(msg_);
    }

    function dispatchTreasuryXcm(bytes calldata xcmMessage) external onlyOwner {
        IXcm.Weight memory w = xcm.weighMessage(xcmMessage);
        xcm.execute(xcmMessage, w);
        totalDispatched++;
        emit TreasuryXcmDispatched(xcmMessage, w.refTime, w.proofSize, block.timestamp);
    }

    function sendCrossChain(bytes calldata dest, bytes calldata xcmMessage) external onlyOwner {
        xcm.send(dest, xcmMessage);
        totalDispatched++;
        emit TreasuryXcmDispatched(xcmMessage, 0, 0, block.timestamp);
    }

    function setTreasury(address _t) external onlyOwner {
        emit TreasuryUpdated(treasury, _t);
        treasury = _t;
    }
}
