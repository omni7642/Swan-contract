import { EtherscanProvider } from "@ethersproject/providers";
import { EHOSTUNREACH } from "constants";
import { ethers } from "hardhat";

import { getMaxTick, getMinTick } from "./ticks";
import { encodePriceSqrt } from "./encodePriceSqrt";
import positionManagerabi from "./abis/NonfungiblePositionManager.json";
import { Wallet } from "ethers";
import { BlockForkEvent } from "@ethersproject/abstract-provider";

async function main() {
  const token0Address = "0x609Bd169413359837E58AdC95bB5BB62E0cd520b";
  const token1Address = "0x927A133eBE9daBf9DFf1b9834CA4415fe948AedC";

  const [owner] = await ethers.getSigners();

  const SwanTreasuryFactory = await ethers.getContractFactory("SwanTreasury");
  const SwanTreasury = await SwanTreasuryFactory.deploy();

  await SwanTreasury.deployed();
  console.log("SwanTreasury = ", SwanTreasury.address);

  const SwanFactoryF = await ethers.getContractFactory("SwanFactory");
  const SwanFactory = await SwanFactoryF.deploy(
    SwanTreasury.address,
    owner.address,
    86400 * 90,
    0
  );
  await SwanFactory.deployed();
  console.log("SwanFactory = ", SwanFactory.address);

  const t = await (
    await SwanFactory.launchCustomTreasury(token0Address, token1Address, 3000)
  ).wait();
  console.log("t = ", t?.events && t?.events[0]?.args);

  const customTreasuryInfo = await SwanFactory.allClones(owner.address, 0);

  const customSwanTreasury = await ethers.getContractAt(
    "SwanTreasury",
    customTreasuryInfo.customTreasury
  );

  const token0 = await ethers.getContractAt("ERC20Token", token0Address);
  const token1 = await ethers.getContractAt("ERC20Token", token1Address);

  console.log("approving to the swan treasury contract for deposit ...");
  await (
    await token0.approve(
      customTreasuryInfo.customTreasury,
      ethers.utils.parseEther("100")
    )
  ).wait();
  await (
    await token1.approve(
      customTreasuryInfo.customTreasury,
      ethers.utils.parseEther("100")
    )
  ).wait();

  console.log("depositing ... ");
  await (await customSwanTreasury.deposite(100, 100)).wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
