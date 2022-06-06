//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "./interfaces/ISwapRouter.sol";

/**
 * @notice Swan Treasury contract that partners deposit their tokens for pair and let the trade wallet do the trading
 * @dev Uniswap trading interface
 * @author rock888
 */
contract SwanTreasury is KeeperCompatibleInterface, ReentrancyGuard {
    // only to distinguish the cloned one
    bool public isBase;
    // prevents the already cloned one from re-initialize
    bool public isInitialized;

    address public partner; // the partner who deposits the funds
    address public swanTrader; // the trader who really do the trading
    address public to; // fee receiver address
    address public mainToken; // main fee token
    address public tokenA; // token0 first token of pair
    address public tokenB; // token1 second token of pair
    uint24 public poolFee; // the pool fee just to get the swap params
    address public pool; // the uniswap v3 pool address

    uint128 public epochDuration; // the swan trading epoch period
    uint128 public epochStart; // the start time for calculating the epoch time

    uint128 public reserveA; // the tokenA amount of the contract
    uint128 public reserveB; // the tokenB amount of the contract
    uint128 public depositAmountA; // the actual value of the tokenA in the contract
    uint128 public depositAmountB; // the actual value of the tokenB in the contract
    uint128 public currentPreInformedAmountA; // current pre informed amount of tokenA
    uint128 public currentPreInformedAmountB; // current pre informed amount of tokenB

    uint128 public lastWithdrawedEpochStart;

    // address public uniSwapRouter = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

    event Deposite(address token, uint128 amount, uint128 reserve);
    event PreInform(address token, uint128 amount);
    event Withdraw(address token, uint128 amount, uint128 reserve);
    event WithdrawFee(address token, uint128 amount, uint128 reserve);
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
        address _to,
        address _tokenA,
        address _tokenB,
        uint24 _poolFee,
        address _mainToken,
        address _factory,
        uint128 _epochDuration,
        uint128 _epochStart
    ) external virtual {
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
        lastWithdrawedEpochStart = currentEpochStartTime();
        pool = IUniswapV3Factory(_factory).getPool(_tokenA, _tokenB, poolFee);
    }

    /// @notice deposite the token pair
    function deposite(uint128 _amountA, uint128 _amountB) external onlyPartner {
        require(
            _amountA > 0 || _amountB > 0,
            "Err: cannot deposit zero amount"
        );
        if (_amountA > 0) {
            IERC20(tokenA).transferFrom(msg.sender, address(this), _amountA);
            depositAmountA += _amountA;
        }
        if (_amountB > 0) {
            IERC20(tokenB).transferFrom(msg.sender, address(this), _amountB);
            depositAmountB += _amountB;
        }
        update();
        emit Deposite(tokenA, _amountA, reserveA);
        emit Deposite(tokenB, _amountB, reserveB);
    }

    /// @notice preinform for the withdraw, need to be done before 3 days from the end of the current epoch
    function preInform(uint128 _amountA, uint128 _amountB)
        external
        onlyPartner
        isInformable
    {
        require(
            _amountA > 0 || _amountB > 0,
            "Err: cannot preinform both zero amounts"
        );
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
    function withdraw() internal nonReentrant {
        if (currentPreInformedAmountA > 0) {
            depositAmountA -= currentPreInformedAmountA;
            IERC20(tokenA).transfer(partner, currentPreInformedAmountA);
            currentPreInformedAmountA = 0;
        }
        if (currentPreInformedAmountB > 0) {
            depositAmountB -= currentPreInformedAmountB;
            IERC20(tokenB).transfer(partner, currentPreInformedAmountB);
            currentPreInformedAmountB = 0;
        }
        update();
        emit Withdraw(tokenA, currentPreInformedAmountA, reserveA);
        emit Withdraw(tokenB, currentPreInformedAmountB, reserveB);
    }

    /// @notice withdraw the fee per epoch
    function withdrawFee() internal nonReentrant {
        uint128 _price = price();
        (uint128 feeAmountA, uint128 feeAmountB) = calculateFee(
            _price,
            ~uint64(0)
        );
        if (feeAmountA > 0) {
            IERC20(tokenA).transfer(to, feeAmountA);
            depositAmountA -= feeAmountA;
        }
        if (feeAmountB > 0) {
            IERC20(tokenB).transfer(to, feeAmountB);
            depositAmountB -= feeAmountB;
        }
        if (feeAmountA > 0 || feeAmountB > 0) update();

        emit WithdrawFee(tokenA, feeAmountA, reserveA);
        emit WithdrawFee(tokenB, feeAmountB, reserveB);
    }

    /// @notice calculate the fee from last withdrawed epoch
    function calculateFee(uint128 valueA, uint128 valueB)
        internal
        view
        returns (uint128 amountA, uint128 amountB)
    {
        uint256 currentValue = uint256(reserveA) *
            uint256(valueA) +
            uint256(reserveB) *
            uint256(valueB);
        int256 profit = int256(currentValue) -
            int256(
                uint256(depositAmountA) *
                    uint256(valueA) +
                    uint256(depositAmountB) *
                    uint256(valueB)
            );
        if (profit > 0) {
            profit = (profit * 20) / 100;
            if (mainToken == tokenA) {
                amountA = uint128(uint256(profit) / valueA);
                if (amountA > reserveA) {
                    amountA = reserveA;
                    amountB = uint128(
                        (uint256(profit) - reserveA * valueA) / valueB
                    );
                }
            } else if (mainToken == tokenB) {
                amountB = uint128(uint256(profit) / valueB);
                if (amountB > reserveB) {
                    amountB = reserveB;
                    amountA = uint128(
                        (uint256(profit) - reserveB * valueB) / valueA
                    );
                }
            }
        }
    }

    /// @notice update the reserve amounts
    function update() public {
        reserveA = uint128(IERC20(tokenA).balanceOf(address(this)));
        reserveB = uint128(IERC20(tokenB).balanceOf(address(this)));
        emit Update();
    }

    /// @notice get the current epoch start time
    function currentEpochStartTime()
        public
        view
        returns (uint128 _currentEpochStartTime)
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
        returns (uint128 currentTime)
    {
        currentTime = uint128(block.timestamp);
    }

    /// @notice get the left time to the next epoch start time
    function periodToNextEpoch()
        public
        view
        returns (uint128 _periodToNextEpoch)
    {
        _periodToNextEpoch =
            ((getCurrentTime() - epochStart) / epochDuration + 1) *
            epochDuration +
            epochStart -
            getCurrentTime();
    }

    /// @notice the pool sqrtPriceX96
    function sqrtPriceX96()
        public
        view
        virtual
        returns (uint160 _sqrtPriceX96)
    {
        (_sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    /// @notice the token0 price over token1 in uint128
    /// The actual price follows the formula below
    /// act_price = price / 2 ** 64;
    /// it's scaled for calculating the actual value
    function price() internal view returns (uint128 _price) {
        uint160 sqrtPX96 = sqrtPriceX96();
        require(
            sqrtPX96 < ~uint128(0),
            "The price is higher than the limit 2 ** 32"
        );
        require(
            sqrtPX96 > ~uint64(0),
            "The price is lower than the limit 2 ** -32"
        );
        uint64 sqrtPX32 = uint64(sqrtPX96 / ~uint64(0));
        _price = uint128(sqrtPX32)**2;
    }

    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        // means the new epoch start time
        upkeepNeeded =
            (getCurrentTime() - lastWithdrawedEpochStart) > epochDuration;
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        require(
            (getCurrentTime() - lastWithdrawedEpochStart) > epochDuration,
            "ERR: already withdrawed for the current epoch"
        );
        lastWithdrawedEpochStart = currentEpochStartTime();
        if (currentPreInformedAmountA > 0 || currentPreInformedAmountB > 0) {
            withdraw();
        }
        withdrawFee();
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
        uint128 amountIn
    ) external onlyTrader {
        IERC20(tokenIn).approve(uniSwapRouter, uint256(amountIn));
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenIn == tokenA ? tokenB : tokenA,
                fee: poolFee,
                recipient: address(this),
                deadline: getCurrentTime(),
                amountIn: uint256(amountIn),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        ISwapRouter(uniSwapRouter).exactInputSingle(params);
        update();
        emit UniswapV3Swap(params);
    }
}
