//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISwanTreasury.sol";

/**
 * @notice Swan factory contract for partners to create their own new custom swan treasury contract
 * @dev EIP1167 implementation
 * @author rock888
 */
contract SwanFactory is Ownable {
    /// @dev the base swan treasury contract
    address public swanTreasuryTarget;

    /// @notice the uniswap v3 core factory contract address
    address public factory;

    /// @notice the swan trading algorithm wallet
    address private swanTrader;

    /// @notice the fee receiver
    address private to;

    /// @dev mapping to have a track of all the deployments (owner => clones[])
    mapping(address => TreasuryInfo[]) public allClones;

    uint256 public epochDuration;
    uint256 public epochStart;

    event NewCustomSwanTreasury(address _newCustomTreasury, address _owner);

    /// @notice treasury info
    struct TreasuryInfo {
        address customTreasury; // newly deployed custom treasury contract address
        address tokenA; // the principal token the partners deposit
        address tokenB; // the target token the swan trader should trade for
    }

    /// @notice sets the target swanTreasury contract address
    constructor(
        address _factory,
        address _swanTreasuryTarget,
        address _swanTrader,
        address _to,
        uint256 _epochDuration,
        uint256 _epochStart
    ) {
        factory = _factory;
        swanTreasuryTarget = _swanTreasuryTarget;
        swanTrader = _swanTrader;
        to = _to;
        epochDuration = _epochDuration;
        epochStart = _epochStart;
    }

    /// @notice the token pair v3 pool must exist
    modifier poolExists(
        address token0,
        address token1,
        uint24 fee
    ) {
        require(
            IUniswapV3Factory(factory).getPool(token0, token1, fee) !=
                address(0),
            "Error: pool does not exist"
        );
        _;
    }

    /// @dev clones new minimul proxy (EIP1167)
    /// @param target the target contract address to be cloned
    /// @return result the cloned new custom proxy
    function _clone(address target) internal returns (address result) {
        bytes20 targetBytes = bytes20(target);

        assembly {
            let clone := mload(0x40)
            mstore(
                clone,
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000
            )
            mstore(add(clone, 0x14), targetBytes)
            mstore(
                add(clone, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )
            result := create(0, clone, 0x37)
        }

        require(result != address(0), "ERC1167: create new treasury failed");
    }

    /// @notice launches the custom treasury contract for the partners
    function launchCustomTreasury(
        address tokenA,
        address tokenB,
        uint24 poolFee,
        address mainToken
    ) external poolExists(tokenA, tokenB, poolFee) returns (address) {
        address customTreasury = _clone(swanTreasuryTarget);
        TreasuryInfo memory newInfo = TreasuryInfo(
            customTreasury,
            tokenA,
            tokenB
        );
        allClones[msg.sender].push(newInfo);
        ISwanTreasury(customTreasury).initialize(
            msg.sender,
            swanTrader,
            to,
            tokenA,
            tokenB,
            poolFee,
            mainToken,
            factory,
            uint128(epochDuration),
            uint128(epochStart)
        );
        emit NewCustomSwanTreasury(customTreasury, msg.sender);
        return customTreasury;
    }

    /// @notice set the new updated swanCustomTreasury contract address (makes it upgradable)
    /// @param _newTarget new target address
    /// @dev only owner can do this
    function setTargetTreasury(address _newTarget) external onlyOwner {
        swanTreasuryTarget = _newTarget;
    }
}
