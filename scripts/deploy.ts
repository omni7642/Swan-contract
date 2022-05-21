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

  const [owner] = await ethers.getSigners();
  // const SwanTreasuryFactory = await ethers.getContractFactory("SwanTreasury");
  // const SwanTreasury = await SwanTreasuryFactory.deploy();

  // await SwanTreasury.deployed();
  // console.log("SwanTreasury = ", SwanTreasury.address);

  // const SwanFactoryF = await ethers.getContractFactory("SwanFactory");
  // const SwanFactory = await SwanFactoryF.deploy(
  //   SwanTreasury.address,
  //   owner.address,
  //   86400 * 10,
  //   0
  // );
  // await SwanFactory.deployed();
  // console.log("SwanFactory = ", SwanFactory.address);

  console.log("deploying tokens ... ");
  const MockTokenFactory = await ethers.getContractFactory("ERC20Token");
  const tokenA = await MockTokenFactory.deploy("mock erc20 token A", "A");
  await tokenA.deployed();
  const tokenB = await MockTokenFactory.deploy("mock erc20 token B", "B");
  await tokenB.deployed();

  console.log("tokenA = ", tokenA.address);
  console.log("tokenB = ", tokenB.address);

  const [token0, token1] =
    tokenA.address > tokenB.address ? [tokenB, tokenA] : [tokenA, tokenB];

  // const t = await (
  //   await SwanFactory.launchCustomTreasury(
  //     tokenA.address,
  //     tokenB.address,
  //     tokenA.address
  //   )
  // ).wait();
  // console.log("t = ", t?.events && t?.events[0]?.args);

  // const customTreasuryInfo = await SwanFactory.allClones(owner.address, 0);

  // const customSwanTreasury = await ethers.getContractAt(
  //   "SwanTreasury",
  //   customTreasuryInfo.customTreasury
  // );

  // const UniswapV3Factory = await ethers.getContractAt(
  //   "IUniswapV3Factory",
  //   UniswapV3FactoryAddress
  // );

  // await (
  //   await UniswapV3Factory.createPool(token0.address, token1.address, 3000)
  // ).wait();
  // const pool = await UniswapV3Factory.getPool(
  //   token0.address,
  //   token1.address,
  //   3000
  // );
  // console.log("pool = ", pool);

  // console.log("encodePriceSqrt(1, 1) = ", encodePriceSqrt(1, 1));
  // const poolContract = await ethers.getContractAt("IUniswapV3Pool", pool);
  // await (await poolContract.initialize(encodePriceSqrt(1, 1))).wait();

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
      amount0Desired: 15,
      amount1Desired: 15,
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
