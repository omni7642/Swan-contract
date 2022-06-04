//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ISwanTreasury {
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
    ) external;
}
