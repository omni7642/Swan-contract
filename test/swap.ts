import { expect } from "chai";
import { sign } from "crypto";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { getMaxTick, getMinTick } from "../scripts/ticks";
import { encodePriceSqrt } from "../scripts/encodePriceSqrt";
import positionManagerabi from "../scripts/abis/NonfungiblePositionManager.json";

describe("Swap test", function () {
  it("Should return the new greeting once it's changed", async function () {
    const UniswapV3FactoryAddress =
      "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
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

    const MockTokenFactory = await ethers.getContractFactory("ERC20Token");
    const tokenA = await MockTokenFactory.deploy("mock erc20 token A", "A");
    await tokenA.deployed();
    const tokenB = await MockTokenFactory.deploy("mock erc20 token B", "B");
    await tokenB.deployed();

    const [token0, token1] =
      tokenA.address > tokenB.address ? [tokenB, tokenA] : [tokenA, tokenB];

    console.log("token0 = ", token0.address);
    console.log("token1 = ", token1.address);

    console.log("launching custom treasury ... ");
    const t = await (
      await SwanFactory.launchCustomTreasury(
        token0.address,
        token1.address,
        3000
      )
    ).wait();
    console.log("t = ", t?.events && t?.events[0]?.args);

    const customTreasuryInfo = await SwanFactory.allClones(owner.address, 0);
    console.log("customTreasury = ", customTreasuryInfo.customTreasury);

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
    let reserveA = await customSwanTreasury.reserveA();
    let reserveB = await customSwanTreasury.reserveB();
    console.log("reserveA = ", reserveA, "\n", "reserveB = ", reserveB);

    console.log("token approving ...");
    await (
      await token0.approve(
        positionManagerAddress,
        ethers.utils.parseEther("100")
      )
    ).wait();
    await (
      await token1.approve(
        positionManagerAddress,
        ethers.utils.parseEther("100")
      )
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

    console.log("swapping ... ");
    await (
      await customSwanTreasury.uniswapv3(swapRouterAddress, token0.address, 10)
    ).wait();

    reserveA = await customSwanTreasury.reserveA();
    reserveB = await customSwanTreasury.reserveB();
    console.log("reserveA = ", reserveA, "\n", "reserveB = ", reserveB);
  });
});
