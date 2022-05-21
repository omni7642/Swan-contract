//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ISwapRouter.sol";

contract SwanTreasury {
    bool public isBase;
    bool public isInitialized;

    address public partner;
    address private swanTrader;
    address public tokenA;
    address public tokenB;
    address public pool;
    uint24 public poolFee;

    uint256 public epochDuration;
    uint256 public epochStart;

    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public currentPreInformedAmountA;
    uint256 public currentPreInformedAmountB;

    // address public uniSwapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    event Deposite(address token, uint256 amount);
    event PreInform(address token, uint256 amount);
    event WithDraw(address token, uint256 amount);
    event UniswapV3Swap(ISwapRouter.ExactInputSingleParams params);

    constructor() {
        // this ensures that the base contract cannot be initialized
        isBase = true;
    }

    modifier onlyPartner() {
        require(partner == msg.sender, "you're not the allowed partner");
        _;
    }

    modifier onlyTrader() {
        require(swanTrader == msg.sender, "you're not the allowed trader");
        _;
    }

    modifier isInformable() {
        uint256 periodToNextEpoch = ((block.timestamp - epochStart) /
            epochDuration +
            1) *
            epochDuration +
            epochStart -
            block.timestamp;
        require(
            periodToNextEpoch >= 86400 * 3,
            "ERROR: it'a not informable after 3 days before the next epoch, do it the next epoch again"
        );
        _;
    }

    function initialize(
        address _partner,
        address _swanTrader,
        address _tokenA,
        address _tokenB,
        address _pool,
        uint24 _poolFee,
        uint256 _epochDuration,
        uint256 _epochStart
    ) external {
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
        tokenA = _tokenA;
        partner = _partner;
        tokenB = _tokenB;
        pool = _pool;
        poolFee = _poolFee;
        swanTrader = _swanTrader;
        epochDuration = _epochDuration;
        epochStart = _epochStart;
        isInitialized = true;
    }

    function deposite(uint256 _amountA, uint256 _amountB) external onlyPartner {
        IERC20(tokenA).transferFrom(msg.sender, address(this), _amountA);
        IERC20(tokenB).transferFrom(msg.sender, address(this), _amountB);
        if (_amountA > 0) {
            reserveA = reserveA + _amountA;
        }
        if (_amountB > 0) {
            reserveB = reserveB + _amountB;
        }
        emit Deposite(tokenA, _amountA);
        emit Deposite(tokenB, _amountB);
    }

    function preInform(uint256 _amountA, uint256 _amountB)
        external
        onlyPartner
        isInformable
    {
        if (_amountA > 0) {
            currentPreInformedAmountA = currentPreInformedAmountA + _amountA;
        }
        if (_amountB > 0) {
            currentPreInformedAmountB = currentPreInformedAmountB + _amountB;
        }
        emit PreInform(tokenA, _amountA);
        emit PreInform(tokenB, _amountB);
    }

    function withDraw(uint256 amountA, uint256 amountB) external onlyPartner {
        if (amountA > 0) {
            require(amountA <= currentPreInformedAmountA, "ERR: amount exceed");
            IERC20(tokenA).transferFrom(address(this), partner, amountA);
            reserveA = reserveA - amountA;
            currentPreInformedAmountA = currentPreInformedAmountA - amountA;
        }
        if (amountB > 0) {
            require(amountB <= currentPreInformedAmountB, "ERR: amount exceed");
            IERC20(tokenB).transferFrom(address(this), partner, amountB);
            currentPreInformedAmountB = currentPreInformedAmountB - amountB;
        }
        emit WithDraw(tokenA, amountA);
        emit WithDraw(tokenB, amountB);
    }

    /// @notice just for general purposes, not use really
    function trade(
        address targetContract,
        uint256 amount,
        bytes calldata data
    ) external onlyTrader {
        (bool success, bytes memory data) = targetContract.call(data);
        require(success, "trade failed");
    }

    /// @notice uniswap v3 swap trigger
    function uniswapv3(
        address uniSwapRouter,
        address tokenIn,
        uint256 amountIn
    ) external onlyTrader {
        IERC20(tokenIn).approve(uniSwapRouter, amountIn);
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenIn == tokenA ? tokenB : tokenA,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        ISwapRouter(uniSwapRouter).exactInputSingle(params);
        emit UniswapV3Swap(params);
    }
}
