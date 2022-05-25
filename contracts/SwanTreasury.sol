//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/ISwapRouter.sol";

/**
 * @notice Swan Treasury contract that partners deposit their tokens for pair and let the trade wallet do the trading
 * @dev Uniswap trading interface
 * @author rock888
 */
contract SwanTreasury is ReentrancyGuard {
    // only to distinguish the cloned one
    bool public isBase;
    // prevents the already cloned one from re-initialize
    bool public isInitialized;

    address public partner; // the partner who deposits the funds
    address private swanTrader; // the trader who really do the trading
    address public tokenA; // token0 first token of pair
    address public tokenB; // token1 second token of pair
    uint24 public poolFee; // the pool fee just to get the swap params

    uint256 public epochDuration; // the swan trading epoch period
    uint256 public epochStart; // the start time for calculating the epoch time

    uint256 public reserveA; // the tokenA amount of the contract
    uint256 public reserveB; // the tokenB amount of the contract
    uint256 public currentPreInformedAmountA; // current pre informed amount of tokenA
    uint256 public currentPreInformedAmountB; // current pre informed amount of tokenB

    uint256 private lastFeeWithdrawedTime;

    // address public uniSwapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    event Deposite(address token, uint256 amount);
    event PreInform(address token, uint256 amount);
    event WithDraw(address token, uint256 amount);
    event UniswapV3Swap(ISwapRouter.ExactInputSingleParams params);
    event Update();

    /// @notice only for the target contract
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

    /// @notice initialize the cloned contract
    function initialize(
        address _partner,
        address _swanTrader,
        address _tokenA,
        address _tokenB,
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
        poolFee = _poolFee;
        swanTrader = _swanTrader;
        epochDuration = _epochDuration;
        epochStart = _epochStart;
        isInitialized = true;
    }

    /// @notice deposite the token pair
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

    /// @notice preinform for the withdraw, need to be done before 3 days from the end of the current epoch
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

    /// @notice withdraw the token pair
    function withdraw(uint256 amountA, uint256 amountB)
        external
        onlyPartner
        nonReentrant
    {
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

    /// @notice withdraw the fee per epoch
    function withdrawFee(address to) external onlyTrader nonReentrant {
        (uint256 feeAmountA, uint256 feeAmountB) = calculateFee();
        IERC20(tokenA).transfer(to, feeAmountA);
        IERC20(tokenB).transfer(to, feeAmountB);
        update();
    }

    /// @notice calculate the fee from last withdrawed epoch
    function calculateFee()
        internal
        view
        returns (uint256 amountA, uint256 amountB)
    {
        uint256 currentTime = block.timestamp;
        uint256 currentEpochStartTime = ((currentTime - epochStart) /
            epochDuration) *
            epochDuration +
            epochStart;
        require(
            currentEpochStartTime > lastFeeWithdrawedTime,
            "ERR: already withdrawed for the current epoch"
        );
        // currently 20 percent fee
        amountA = (reserveA * 20) / 100;
        amountB = (reserveB * 20) / 100;
    }

    /// @notice update the reserve amounts
    function update() public {
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));
        emit Update();
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
        update();
        emit UniswapV3Swap(params);
    }
}
