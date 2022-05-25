import { expect } from "chai";
import { sign } from "crypto";
import { Signer } from "ethers";
import { ethers } from "hardhat";

describe("Greeter", function () {
  it("Should return the new greeting once it's changed", async function () {
    const [owner] = await ethers.getSigners();
    const SwanTreasuryFactory = await ethers.getContractFactory("SwanTreasury");
    const SwanTreasury = await SwanTreasuryFactory.deploy();
    await SwanTreasury.deployed();
    console.log("SwanTreasury = ", SwanTreasury.address);

    const SwanFactoryF = await ethers.getContractFactory("SwanFactory");
    const SwanFactory = await SwanFactoryF.deploy(
      SwanTreasury.address,
      owner.address,
      86400 * 10,
      0
    );
    await SwanFactory.deployed();
    console.log("SwanFactory = ", SwanFactory.address);

    const MockTokenFactory = await ethers.getContractFactory("ERC20Token");
    const tokenA = await MockTokenFactory.deploy("mock erc20 token A", "A");
    await tokenA.deployed();
    const tokenB = await MockTokenFactory.deploy("mock erc20 token B", "B");
    await tokenB.deployed();

    const t = await (
      await SwanFactory.launchCustomTreasury(
        tokenA.address,
        tokenB.address,
        3000
      )
    ).wait();
    console.log("t = ", t?.events && t?.events[0]?.args);

    const customTreasuryInfo = await SwanFactory.allClones(owner.address, 0);

    const customSwanTreasury = await ethers.getContractAt(
      "SwanTreasury",
      customTreasuryInfo.customTreasury
    );
    console.log("approving ... ");
    await (await tokenA.approve(customTreasuryInfo.customTreasury, 100)).wait();
    await (await tokenB.approve(customTreasuryInfo.customTreasury, 100)).wait();

    console.log("depositing ... ");
    await (await customSwanTreasury.deposite(100, 100)).wait();
    console.log("updating ... ");
    await (await customSwanTreasury.update()).wait();
  });
});
