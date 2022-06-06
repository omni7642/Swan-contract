//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./SwanTreasury.sol";

contract MockTreasury is SwanTreasury {
    uint128 public currentTime;
    uint160 public currentPriceX96;

    /// @notice initialize the cloned contract
    function initialize(
        address _partner,
        address _swanTrader,
        address _to,
        address _tokenA,
        address _tokenB,
        uint24 _poolFee,
        address _mainToken,
        address _factory,
        uint128 _epochDuration,
        uint128 _epochStart
    ) external override {
        // For the base contract, itBase == true. Impossible to use.
        // if it's initialized once then it's not possible to use again
        require(
            isBase == false,
            "ERROR: This is base contract, cannot be initialized"
        );
        require(
            isInitialized == false,
            "ERROR: This is already isInitialized. redo is not allowed"
        );
        require(
            _mainToken == _tokenA || _mainToken == _tokenB,
            "ERROR: mainToken is not available"
        );
        tokenA = _tokenA;
        partner = _partner;
        tokenB = _tokenB;
        poolFee = _poolFee;
        mainToken = _mainToken;
        swanTrader = _swanTrader;
        to = _to;
        epochDuration = _epochDuration;
        epochStart = _epochStart;
        isInitialized = true;
        // lastWithdrawedEpochStart = currentEpochStartTime();
        pool = IUniswapV3Factory(_factory).getPool(_tokenA, _tokenB, poolFee);
    }

    function setCurrentTime(uint128 time) external {
        currentTime = time;
    }

    function getCurrentTime() internal view override returns (uint128 time) {
        time = currentTime;
    }

    function setLastWithdrawedEpochStart() external {
        lastWithdrawedEpochStart = currentEpochStartTime();
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
