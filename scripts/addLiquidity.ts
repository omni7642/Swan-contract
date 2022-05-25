import { EtherscanProvider } from "@ethersproject/providers";
import { ethers } from "hardhat";

import { getMaxTick, getMinTick } from "./ticks";
import { encodePriceSqrt } from "./encodePriceSqrt";
import positionManagerabi from "./abis/NonfungiblePositionManager.json";
import { Wallet } from "ethers";
import { BlockForkEvent } from "@ethersproject/abstract-provider";

async function main() {
  const UniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const token0Address = "0x8950155745835259aaa77fece3826fe2fad882dc";
  const token1Address = "0xefadadb15be5bb1113da5f6c34f47ef5e30bbac4";

  const [owner] = await ethers.getSigners();

  const positionManager = await ethers.getContractAt(
    positionManagerabi.abi,
    positionManagerAddress
  );

  let time = (
    await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
  ).timestamp;
  console.log("current timestamp = ", time);
  console.log("min max tick = ", getMinTick(60), getMaxTick(60));
  console.log("creating new position ... ");
  await (
    await positionManager.mint({
      token0: token0Address,
      token1: token1Address,
      fee: 3000,
      tickLower: getMinTick(60),
      tickUpper: getMaxTick(60),
      amount0Desired: 100,
      amount1Desired: 100,
      amount0Min: 0,
      amount1Min: 0,
      recipient: owner.address,
      deadline: time + 100,
    })
  ).wait();

  let nftbal = await positionManager.balanceOf(owner.address);
  console.log("nftbal = ", nftbal);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
