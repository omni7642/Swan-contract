//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ISwanTreasury {
    function initialize(
        address _partner,
        address _swanTrader,
        address _tokenA,
        address _tokenB,
        uint256 _epochDuration,
        uint256 _epochStart
    ) external;
}
