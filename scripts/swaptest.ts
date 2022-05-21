// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { EtherscanProvider } from "@ethersproject/providers";
import { EHOSTUNREACH } from "constants";
import { ethers } from "hardhat";

import { getMaxTick, getMinTick } from "./ticks";
import { encodePriceSqrt } from "./encodePriceSqrt";
import positionManagerabi from "./abis/NonfungiblePositionManager.json";
import { Wallet } from "ethers";
import { BlockForkEvent } from "@ethersproject/abstract-provider";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy

  // constants
  const UniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const token0Address = "0x8950155745835259aaa77fece3826fe2fad882dc";
  const token1Address = "0xefadadb15be5bb1113da5f6c34f47ef5e30bbac4";
  const poolAddress = "0x8a853ae9b9454c96c24f8ea5079fdb78f8291b59";
  const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

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

  const t = await (
    await SwanFactory.launchCustomTreasury(
      token0Address,
      token1Address,
      poolAddress,
      3000
    )
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
  await (await customSwanTreasury.deposite(10, 10)).wait();

  console.log("swapping ... ");
  await (
    await customSwanTreasury.uniswapv3(swapRouterAddress, token0Address, 5)
  ).wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
