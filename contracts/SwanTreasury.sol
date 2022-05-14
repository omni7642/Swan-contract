//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SwanTreasury {
    bool public isBase;
    bool public isInitialized;

    address public partner;
    address private swanTrader;
    address public principalToken;
    address public targetToken;

    uint256 public epochDuration;
    uint256 public epochStart;

    uint256 public totalDeposit;
    uint256 public currentPreInformedAmount;
    uint256 public lastPreInformedTime;

    event Deposite(uint256 amount);
    event PreInform(uint256 amount);
    event WithDraw(uint256 amount);

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
        address _principalToken,
        address _targetToken,
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
        principalToken = _principalToken;
        partner = _partner;
        targetToken = _targetToken;
        swanTrader = _swanTrader;
        epochDuration = _epochDuration;
        epochStart = _epochStart;
        isInitialized = true;
    }

    function deposite(uint256 _amount) external onlyPartner {
        IERC20(principalToken).transferFrom(msg.sender, address(this), _amount);
        totalDeposit = totalDeposit + _amount;
        emit Deposite(_amount);
    }

    function preInform(uint256 _amount) external onlyPartner isInformable {
        currentPreInformedAmount = currentPreInformedAmount + _amount;
        emit PreInform(_amount);
    }

    function withDraw() external onlyPartner {
        require(currentPreInformedAmount > 0, "Error: you didn't preInformed");
        IERC20(principalToken).transferFrom(
            address(this),
            partner,
            currentPreInformedAmount
        );
        emit WithDraw(currentPreInformedAmount);
    }

    function trade(
        address targetContract,
        uint256 amount,
        bytes calldata data
    ) external onlyTrader {
        (bool success, bytes memory data) = targetContract.call(data);
        require(success, "trade failed");
    }
}
