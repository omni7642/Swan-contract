import { expect } from "chai";
import { ethers } from "hardhat";
import { getMaxTick, getMinTick } from "../scripts/ticks";
import { encodePriceSqrt } from "../scripts/encodePriceSqrt";
import positionManagerabi from "../scripts/abis/NonfungiblePositionManager.json";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { beforeEach, describe, it } from "mocha";
import JSBI from "jsbi";
import {
  ERC20Token,
  MockTreasury,
  SwanFactory,
  SwanTreasury,
} from "../typechain";

describe("test0", function () {
  // const UniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const factoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

  let token0: ERC20Token;
  let token1: ERC20Token;
  let tokenA: ERC20Token;
  let tokenB: ERC20Token;
  let owner: SignerWithAddress;
  let partner: SignerWithAddress;
  let trader: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let customTreasuryAddress: string;
  let customSwanTreasury: MockTreasury;
  let SwanTreasury: SwanTreasury;
  let positionManager: Contract;
  let SwanFactory: SwanFactory;
  let currentTime: number;

  beforeEach("get signers and deploy", async () => {
    [owner, partner, trader, ...addrs] = await ethers.getSigners();

    const SwanTreasuryFactory = await ethers.getContractFactory("MockTreasury");
    SwanTreasury = await SwanTreasuryFactory.deploy();
    await SwanTreasury.deployed();
    // console.log("SwanTreasury = ", SwanTreasury.address);

    currentTime = Math.floor(Date.now() / 1000);

    const SwanFactoryF = await ethers.getContractFactory("SwanFactory");
    SwanFactory = await SwanFactoryF.deploy(
      factoryAddress,
      SwanTreasury.address,
      trader.address,
      owner.address,
      86400 * 90,
      currentTime
    );
    await SwanFactory.deployed();
    // console.log("SwanFactory = ", SwanFactory.address);

    const MockTokenFactory = await ethers.getContractFactory("ERC20Token");
    tokenA = await MockTokenFactory.connect(partner).deploy(
      "mock erc20 token A",
      "A"
    );
    tokenA.deployed();
    tokenB = await MockTokenFactory.connect(partner).deploy(
      "mock erc20 token B",
      "B"
    );
    tokenB.deployed();

    [token0, token1] =
      tokenA.address.toLowerCase() > tokenB.address.toLowerCase()
        ? [tokenB, tokenA]
        : [tokenA, tokenB];

    // console.log("token0 = ", token0.address);
    // console.log("token1 = ", token1.address);

    // console.log("token approving ...");
    await (
      await token0
        .connect(partner)
        .approve(positionManagerAddress, ethers.utils.parseEther("100"))
    ).wait();
    await (
      await token1
        .connect(partner)
        .approve(positionManagerAddress, ethers.utils.parseEther("100"))
    ).wait();

    positionManager = await ethers.getContractAt(
      positionManagerabi.abi,
      positionManagerAddress
    );

    // console.log("create and initializing the new pool ... ");
    await (
      await positionManager.createAndInitializePoolIfNecessary(
        token0.address,
        token1.address,
        3000,
        encodePriceSqrt(1, 1)
      )
    ).wait();

    // console.log("current timestamp = ", currentTime);
    // console.log("min max tick = ", getMinTick(60), getMaxTick(60));
    // console.log("creating new position ... ");
    await (
      await positionManager.connect(partner).mint({
        token0: token0.address,
        token1: token1.address,
        fee: 3000,
        tickLower: getMinTick(60),
        tickUpper: getMaxTick(60),
        amount0Desired: 10000000000,
        amount1Desired: 10000000000,
        amount0Min: 0,
        amount1Min: 0,
        recipient: partner.address,
        deadline: currentTime + 100,
      })
    ).wait();

    let nftbal = await positionManager.balanceOf(partner.address);
    // console.log("nftbal = ", nftbal);

    // console.log("launching custom treasury ... ");
    const t = await (
      await SwanFactory.connect(partner).launchCustomTreasury(
        token0.address,
        token1.address,
        3000,
        token1.address
      )
    ).wait();
    // console.log("t = ", t?.events && t?.events[0]?.args);

    const customTreasuryInfo = await SwanFactory.allClones(partner.address, 0);
    // console.log("customTreasury = ", customTreasuryInfo.customTreasury);
    customTreasuryAddress = customTreasuryInfo.customTreasury;

    customSwanTreasury = await ethers.getContractAt(
      "MockTreasury",
      customTreasuryAddress
    );

    // console.log("approving ... ");
    await (
      await token0.connect(partner).approve(customTreasuryAddress, 10000)
    ).wait();
    await (
      await token1.connect(partner).approve(customTreasuryAddress, 10000)
    ).wait();

    // console.log("depositing ... ");
    await (
      await customSwanTreasury.connect(partner).deposite(10000, 10000)
    ).wait();

    // console.log("updating ... ");
    await (await customSwanTreasury.update()).wait();
    let reserveA = await customSwanTreasury.reserveA();
    let reserveB = await customSwanTreasury.reserveB();
    // console.log("reserveA = ", reserveA, "\n", "reserveB = ", reserveB);

    // console.log("setting current time ... ");
    await (await customSwanTreasury.setCurrentTime(currentTime)).wait();
    await (await customSwanTreasury.setLastWithdrawedEpochStart()).wait();
  });

  describe("swap test", () => {
    it("base treasury contract is not initializable", async () => {
      await expect(
        SwanTreasury.initialize(
          partner.address,
          trader.address,
          owner.address,
          token0.address,
          token1.address,
          3000,
          token0.address,
          factoryAddress,
          86400 * 90,
          currentTime
        )
      ).to.be.revertedWith(
        "ERROR: This is base contract, cannot be initialized"
      );
    });

    it("custom treasury contract is not re-initializable", async () => {
      await expect(
        customSwanTreasury.initialize(
          partner.address,
          trader.address,
          owner.address,
          token0.address,
          token1.address,
          3000,
          token0.address,
          factoryAddress,
          86400 * 90,
          currentTime
        )
      ).to.be.revertedWith(
        "ERROR: This is already isInitialized. redo is not allowed"
      );
    });

    it("deposite with zero token0/token1 amount", async () => {
      await (
        await token0.connect(partner).approve(customTreasuryAddress, 10000)
      ).wait();
      await (
        await token1.connect(partner).approve(customTreasuryAddress, 10000)
      ).wait();
      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      await (
        await customSwanTreasury.connect(partner).deposite(0, 10000)
      ).wait();
      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA);
      expect(reserveB).to.be.eq(_reserveB.add(10000));
      await (
        await customSwanTreasury.connect(partner).deposite(10000, 0)
      ).wait();
      let __reserveA = await customSwanTreasury.reserveA();
      let __reserveB = await customSwanTreasury.reserveB();
      expect(__reserveA).to.be.eq(reserveA.add(10000));
      expect(__reserveB).to.be.eq(reserveB);
    });

    it("Basic test", async function () {
      await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();

      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      // console.log("swapping ... ");
      await (
        await customSwanTreasury
          .connect(trader)
          .uniswapv3(swapRouterAddress, token0.address, 3)
      ).wait();

      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      // console.log("reserveA = ", reserveA, "\n", "reserveB = ", reserveB);
      expect(reserveA).to.be.eq(_reserveA.sub(3));
      expect(reserveB).to.be.eq(_reserveB.add(1));
    });

    it("preinform fails if not partner", async () => {
      // console.log("setting current time 88 days in the future");
      let currentContracTime = await customSwanTreasury.currentTime();
      // console.log("current contract time = ", currentContracTime.toNumber());
      // console.log("current timestamp = ", Date.now() / 1000);
      let currentEpochStartTime =
        await customSwanTreasury.currentEpochStartTime();
      // console.log("currentEpochStartTime = ", currentEpochStartTime.toNumber());
      let periodToNextEpoch = await customSwanTreasury.periodToNextEpoch();
      // console.log(
      //   "period to the next epoch = ",
      //   periodToNextEpoch.toNumber() / 86400
      // );

      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.toNumber() + 86400 * 85
        )
      ).wait();
      // console.log("preinforming ... ");
      await expect(customSwanTreasury.preInform(100, 100)).to.be.revertedWith(
        "you're not the allowed partner"
      );
    });

    it("preinform fails if not the right time (3 days margin)", async () => {
      let currentContracTime = await customSwanTreasury.currentTime();
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 88)
        )
      ).wait();
      // console.log("preinforming ... ");
      await expect(
        customSwanTreasury.connect(partner).preInform(100, 100)
      ).to.be.revertedWith(
        "ERROR: it'a not informable after 3 days before the next epoch, do it the next epoch again"
      );
    });

    it("preinform with zero token0/token1 amount", async () => {
      let currentContracTime = await customSwanTreasury.currentTime();
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 85)
        )
      ).wait();
      await (
        await customSwanTreasury.connect(partner).preInform(0, 100)
      ).wait();
      expect(await customSwanTreasury.currentPreInformedAmountA()).to.be.eq(0);
      expect(await customSwanTreasury.currentPreInformedAmountB()).to.be.eq(
        100
      );
      await (
        await customSwanTreasury.connect(partner).preInform(100, 0)
      ).wait();
      expect(await customSwanTreasury.currentPreInformedAmountA()).to.be.eq(
        100
      );
      expect(await customSwanTreasury.currentPreInformedAmountB()).to.be.eq(
        100
      );
    });

    it("preInform if the partner at the right time", async () => {
      let currentContracTime = await customSwanTreasury.currentTime();
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 85)
        )
      ).wait();
      await (
        await customSwanTreasury.connect(partner).preInform(100, 100)
      ).wait();
      expect(await customSwanTreasury.currentPreInformedAmountA()).to.be.eq(
        100
      );
      expect(await customSwanTreasury.currentPreInformedAmountB()).to.be.eq(
        100
      );
    });

    it("withdraw at the start of the next epoch", async () => {
      let currentContracTime = await customSwanTreasury.currentTime();
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 85)
        )
      ).wait();
      await (
        await customSwanTreasury.connect(partner).preInform(100, 100)
      ).wait();
      expect(await customSwanTreasury.currentPreInformedAmountA()).to.be.eq(
        100
      );
      expect(await customSwanTreasury.currentPreInformedAmountB()).to.be.eq(
        100
      );
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 90 + 1)
        )
      ).wait();
      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      // setting the current sqrtPriceX96 as 39614081257132168796771975168 = sqrt(0.25 * 2 ** 192)
      await (
        await customSwanTreasury.setCurrentPriceX96(
          "39614081257132168796771975168"
        )
      ).wait();
      await (await customSwanTreasury.performUpkeep("0x")).wait();
      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA.sub(100));
      expect(reserveB).to.be.eq(_reserveB.sub(100));
    });

    it("withdraw fee 20 percent of the profit", async () => {
      let currentTime = await customSwanTreasury.currentTime();
      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      await (
        await customSwanTreasury
          .connect(trader)
          .uniswapv3(swapRouterAddress, token0.address, 3000)
      ).wait();

      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA.sub(3000));
      expect(reserveB).to.be.eq(_reserveB.add(2990));
      await (
        await customSwanTreasury.setCurrentTime(currentTime.add(86400 * 90 + 1))
      ).wait();
      // setting the current sqrtPriceX96 as 39614081257132168796771975168 = sqrt(0.25 * 2 ** 192)
      await (
        await customSwanTreasury.setCurrentPriceX96(
          "39614081257132168796771975168"
        )
      ).wait();
      let [upkeepNeeded] = await customSwanTreasury.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.eq(true);
      await (await customSwanTreasury.performUpkeep("0x")).wait();
      reserveA = await customSwanTreasury.reserveA();
      reserveB = await customSwanTreasury.reserveB();
      expect(reserveB.toNumber()).to.be.eq(12543);
      // expect(reserveA.toNumber()).to.be.eq(5209);
    });

    it("withdraw fee fails if not enough time", async () => {
      currentTime = Math.floor(Date.now() / 1000);
      await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();
      await (await customSwanTreasury.setLastWithdrawedEpochStart()).wait();

      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      await (
        await customSwanTreasury
          .connect(trader)
          .uniswapv3(swapRouterAddress, token0.address, 3)
      ).wait();

      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA.sub(3));
      expect(reserveB).to.be.eq(_reserveB.add(1));
      await (
        await customSwanTreasury.setCurrentTime(currentTime + 86400 * 89)
      ).wait();

      // setting the current sqrtPriceX96 as 56022770974786139918731938227 = sqrt(0.5 * 2 ** 192)
      await (
        await customSwanTreasury.setCurrentPriceX96(
          "56022770974786139918731938227"
        )
      ).wait();
      let [upkeepNeeded] = await customSwanTreasury.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.eq(false);
      await expect(customSwanTreasury.performUpkeep("0x")).to.be.revertedWith(
        "ERR: already withdrawed for the current epoch"
      );
    });

    it("withdraw fee and partner withdraw at the start of the next epoch", async () => {
      let currentContracTime = await customSwanTreasury.currentTime();
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 85)
        )
      ).wait();
      await (
        await customSwanTreasury.connect(partner).preInform(100, 100)
      ).wait();
      expect(await customSwanTreasury.currentPreInformedAmountA()).to.be.eq(
        100
      );
      expect(await customSwanTreasury.currentPreInformedAmountB()).to.be.eq(
        100
      );

      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      await (
        await customSwanTreasury
          .connect(trader)
          .uniswapv3(swapRouterAddress, token0.address, 3000)
      ).wait();

      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA.sub(3000));
      expect(reserveB).to.be.eq(_reserveB.add(2990));
      await (
        await customSwanTreasury.setCurrentTime(
          currentContracTime.add(86400 * 90 + 1)
        )
      ).wait();
      // setting the current sqrtPriceX96 as 39614081257132168796771975168 = sqrt(0.25 * 2 ** 192)
      await (
        await customSwanTreasury.setCurrentPriceX96(
          "39614081257132168796771975168"
        )
      ).wait();
      let [upkeepNeeded] = await customSwanTreasury.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.eq(true);
      await (await customSwanTreasury.performUpkeep("0x")).wait();
      reserveA = await customSwanTreasury.reserveA();
      reserveB = await customSwanTreasury.reserveB();
      expect(reserveB.toNumber()).to.be.eq(12443);
      // expect(reserveA.toNumber()).to.be.eq(5209);
      [upkeepNeeded] = await customSwanTreasury.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.eq(false);
    });
    // it("withdraw fails if not trader", async () => {
    //   currentTime = Math.floor(Date.now() / 1000);
    //   await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();
    //   await (
    //     await customSwanTreasury.setLastFeeWithdrawedTime(currentTime)
    //   ).wait();

    //   let _reserveA = await customSwanTreasury.reserveA();
    //   let _reserveB = await customSwanTreasury.reserveB();
    //   await (
    //     await customSwanTreasury
    //       .connect(trader)
    //       .uniswapv3(swapRouterAddress, token0.address, 3)
    //   ).wait();

    //   let reserveA = await customSwanTreasury.reserveA();
    //   let reserveB = await customSwanTreasury.reserveB();
    //   expect(reserveA).to.be.eq(_reserveA.sub(3));
    //   expect(reserveB).to.be.eq(_reserveB.add(1));
    //   await (
    //     await customSwanTreasury.setCurrentTime(currentTime + 86400 * 90)
    //   ).wait();
    //   // await expect(
    //   //   customSwanTreasury
    //   //     .connect(addrs[0])
    //   //     .withdrawFee(token1.address, owner.address)
    //   // ).to.be.revertedWith("you're not the allowed trader");
    //   // let sqrtPrice = await customSwanTreasury.sqrtPriceX96();
    //   // console.log("sqrtPrice = ", sqrtPrice);
    //   // const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
    //   // const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2));
    //   // let price = JSBI.divide(
    //   //   JSBI.multiply(JSBI.BigInt(sqrtPrice), JSBI.BigInt(1)),
    //   //   Q96
    //   // );
    //   // console.log("price = ", price.toString());
    // });
  });
});
