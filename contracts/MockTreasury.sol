//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./SwanTreasury.sol";

contract MockTreasury is SwanTreasury {
    uint128 public currentTime;
    uint160 public currentPriceX96;

    function setCurrentTime(uint128 time) external {
        currentTime = time;
    }

    function getCurrentTime() internal view override returns (uint128 time) {
        time = currentTime;
    }

    function setLastFeeWithdrawedTime(uint128 time) external {
        lastFeeWithdrawedTime = time;
    }

    function sqrtPriceX96()
        public
        view
        override
        returns (uint160 _sqrtPriceX96)
    {
        _sqrtPriceX96 = currentPriceX96;
    }

    function setCurrentPriceX96(uint160 priceX96) external {
        currentPriceX96 = priceX96;
    }
}
