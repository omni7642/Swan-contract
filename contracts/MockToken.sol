//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20 {
    uint256 public initialSupply = 10000;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * 10**decimals());
    }
}
