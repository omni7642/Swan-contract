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

  const [owner] = await ethers.getSigners();

  console.log("deploying tokens ... ");
  const MockTokenFactory = await ethers.getContractFactory("ERC20Token");
  const tokenA = await MockTokenFactory.deploy("mock erc20 token A", "A");
  await tokenA.deployed();
  const tokenB = await MockTokenFactory.deploy("mock erc20 token B", "B");
  await tokenB.deployed();

  const [token0, token1] =
    tokenA.address > tokenB.address ? [tokenB, tokenA] : [tokenA, tokenB];

  console.log("token0 = ", token0.address);
  console.log("token1 = ", token1.address);

  console.log("token approving ...");
  await (
    await token0.approve(positionManagerAddress, ethers.utils.parseEther("100"))
  ).wait();
  await (
    await token1.approve(positionManagerAddress, ethers.utils.parseEther("100"))
  ).wait();

  const positionManager = await ethers.getContractAt(
    positionManagerabi.abi,
    positionManagerAddress
  );

  console.log("create and initializing the new pool ... ");
  await (
    await positionManager.createAndInitializePoolIfNecessary(
      token0.address,
      token1.address,
      3000,
      encodePriceSqrt(1, 1)
    )
  ).wait();

  let time = (
    await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
  ).timestamp;
  console.log("current timestamp = ", time);
  console.log("min max tick = ", getMinTick(60), getMaxTick(60));
  console.log("creating new position ... ");
  await (
    await positionManager.mint({
      token0: token0.address,
      token1: token1.address,
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
