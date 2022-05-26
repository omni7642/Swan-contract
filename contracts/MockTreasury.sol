//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./SwanTreasury.sol";

contract MockTreasury is SwanTreasury {
    uint256 public currentTime;

    function setCurrentTime(uint256 time) external {
        currentTime = time;
    }

    function getCurrentTime() internal view override returns (uint256 time) {
        time = currentTime;
    }

    function setLastFeeWithdrawedTime(uint256 time) external {
        lastFeeWithdrawedTime = time;
    }
}
