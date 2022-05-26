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
    uint256 public currentValueA; // the actual value of the tokenA in the contract
    uint256 public currentValueB; // the actual value of the tokenB in the contract
    uint256 public epochStartValueA; // the tokenA value to USDC(10000 means 1USDC)
    uint256 public epochStartValueB; // the tokenB value to USDC(10000 means 1USDC)
    uint256 public currentPreInformedAmountA; // current pre informed amount of tokenA
    uint256 public currentPreInformedAmountB; // current pre informed amount of tokenB

    uint256 public lastFeeWithdrawedTime;

    // address public uniSwapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    event Deposite(address token, uint256 amount, uint256 reserve);
    event PreInform(address token, uint256 amount);
    event Withdraw(address token, uint256 amount, uint256 reserve);
    event WithdrawFee(address token, uint256 amount, uint256 reserve);
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
        require(
            periodToNextEpoch() >= 86400 * 3,
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
        lastFeeWithdrawedTime = getCurrentTime();
    }

    /// @notice deposite the token pair
    function deposite(
        uint256 _amountA,
        uint256 _amountB,
        uint256 _valueA,
        uint256 _valueB
    ) external onlyPartner {
        if (_amountA > 0)
            IERC20(tokenA).transferFrom(msg.sender, address(this), _amountA);
        if (_amountB > 0)
            IERC20(tokenB).transferFrom(msg.sender, address(this), _amountB);
        update();
        currentValueA += _amountA * _valueA;
        currentValueB += _amountB * _valueB;
        emit Deposite(tokenA, _amountA, reserveA);
        emit Deposite(tokenB, _amountB, reserveB);
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
            IERC20(tokenA).transfer(partner, amountA);
            currentPreInformedAmountA = currentPreInformedAmountA - amountA;
            currentValueA = (currentValueA * (reserveA - amountA)) / reserveA;
        }
        if (amountB > 0) {
            require(amountB <= currentPreInformedAmountB, "ERR: amount exceed");
            IERC20(tokenB).transfer(partner, amountB);
            currentPreInformedAmountB = currentPreInformedAmountB - amountB;
            currentValueB = (currentValueB * (reserveB - amountB)) / reserveB;
        }
        update();
        emit Withdraw(tokenA, amountA, reserveA);
        emit Withdraw(tokenB, amountB, reserveB);
    }

    /// @notice withdraw the fee per epoch
    function withdrawFee(
        uint256 valueA,
        uint256 valueB,
        address mainToken,
        address to
    ) external onlyTrader nonReentrant {
        (uint256 feeAmountA, uint256 feeAmountB) = calculateFee(
            valueA,
            valueB,
            mainToken
        );
        if (feeAmountA > 0) IERC20(tokenA).transfer(to, feeAmountA);
        if (feeAmountB > 0) IERC20(tokenB).transfer(to, feeAmountB);
        if (feeAmountA > 0 || feeAmountB > 0) update();
        lastFeeWithdrawedTime = getCurrentTime();
        currentValueA = valueA * reserveA;
        currentValueB = valueA * reserveB;
        emit WithdrawFee(tokenA, feeAmountA, reserveA);
        emit WithdrawFee(tokenB, feeAmountB, reserveB);
    }

    /// @notice calculate the fee from last withdrawed epoch
    function calculateFee(
        uint256 valueA,
        uint256 valueB,
        address mainToken
    ) internal view returns (uint256 amountA, uint256 amountB) {
        uint256 _currentEpochStartTime = currentEpochStartTime();
        require(
            _currentEpochStartTime > lastFeeWithdrawedTime,
            "ERR: already withdrawed for the current epoch"
        );
        uint256 currentValue = reserveA * valueA + reserveB * valueB;
        int256 profit = int256(currentValue) -
            int256(currentValueA + currentValueB);
        if (profit > 0) {
            profit = (profit * 20) / 100;
            if (mainToken == tokenA) {
                amountA = uint256(profit) / valueA;
                if (amountA > reserveA) {
                    amountA = reserveA;
                    amountB = (uint256(profit) - reserveA * valueA) / valueB;
                }
            } else if (mainToken == tokenB) {
                amountB = uint256(profit) / valueB;
                if (amountB > reserveB) {
                    amountB = reserveB;
                    amountA = (uint256(profit) - reserveB * valueB) / valueA;
                }
            }
        }
    }

    /// @notice update the reserve amounts
    function update() public {
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));
        emit Update();
    }

    /// @notice get the current epoch start time
    function currentEpochStartTime()
        public
        view
        returns (uint256 _currentEpochStartTime)
    {
        _currentEpochStartTime =
            ((getCurrentTime() - epochStart) / epochDuration) *
            epochDuration +
            epochStart;
    }

    /// @notice get current timestamp
    function getCurrentTime()
        internal
        view
        virtual
        returns (uint256 currentTime)
    {
        currentTime = block.timestamp;
    }

    /// @notice get the left time to the next epoch start time
    function periodToNextEpoch()
        public
        view
        returns (uint256 _periodToNextEpoch)
    {
        _periodToNextEpoch =
            ((getCurrentTime() - epochStart) / epochDuration + 1) *
            epochDuration +
            epochStart -
            getCurrentTime();
    }

    // /// @notice just for general purposes, not use really, will be deleted
    // function trade(
    //     address targetContract,
    //     uint256 amount,
    //     bytes calldata data
    // ) external onlyTrader {
    //     (bool success, bytes memory data) = targetContract.call(data);
    //     require(success, "trade failed");
    // }

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
                deadline: getCurrentTime(),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        ISwapRouter(uniSwapRouter).exactInputSingle(params);
        update();
        emit UniswapV3Swap(params);
    }
}
