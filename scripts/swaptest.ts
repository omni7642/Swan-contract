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
  const token0Address = "0x609Bd169413359837E58AdC95bB5BB62E0cd520b";
  const token1Address = "0x927A133eBE9daBf9DFf1b9834CA4415fe948AedC";
  const poolAddress = "0xffE9A2E7D0b8C90fE86fF4dE06b2A66dD1D0eAFb";
  const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const customSwanTreasuryAddress =
    "0x60d223F178205aB79C02a6Ab8e73C7B79C2C01C0";

  const customSwanTreasury = await ethers.getContractAt(
    "SwanTreasury",
    customSwanTreasuryAddress
  );

  console.log("swapping ... ");
  await (
    await customSwanTreasury.uniswapv3(swapRouterAddress, token1Address, 3)
  ).wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
