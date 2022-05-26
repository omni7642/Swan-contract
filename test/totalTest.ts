import { expect } from "chai";
import { sign } from "crypto";
import { ethers } from "hardhat";
import { getMaxTick, getMinTick } from "../scripts/ticks";
import { encodePriceSqrt } from "../scripts/encodePriceSqrt";
import positionManagerabi from "../scripts/abis/NonfungiblePositionManager.json";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { beforeEach, describe, it } from "mocha";
import {
  ERC20Token,
  MockTreasury,
  SwanFactory,
  SwanTreasury,
} from "../typechain";
import { extendOwn } from "underscore";

describe("test0", function () {
  const UniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const positionManagerAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

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

    currentTime = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;

    const SwanFactoryF = await ethers.getContractFactory("SwanFactory");
    SwanFactory = await SwanFactoryF.deploy(
      SwanTreasury.address,
      trader.address,
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

    // console.log("launching custom treasury ... ");
    const t = await (
      await SwanFactory.connect(partner).launchCustomTreasury(
        token0.address,
        token1.address,
        3000
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
      await customSwanTreasury
        .connect(partner)
        .deposite(10000, 10000, 10000, 20000)
    ).wait();

    // console.log("updating ... ");
    await (await customSwanTreasury.update()).wait();
    let reserveA = await customSwanTreasury.reserveA();
    let reserveB = await customSwanTreasury.reserveB();
    // console.log("reserveA = ", reserveA, "\n", "reserveB = ", reserveB);

    // console.log("setting current time ... ");
    await (
      await customSwanTreasury.setCurrentTime(Math.round(Date.now() / 1000))
    ).wait();

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

    currentTime = (
      await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
    ).timestamp;
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
  });

  describe("swap test", () => {
    it("base treasury contract is not initializable", async () => {
      await expect(
        SwanTreasury.initialize(
          partner.address,
          trader.address,
          token0.address,
          token1.address,
          3000,
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
          token0.address,
          token1.address,
          3000,
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
        await customSwanTreasury
          .connect(partner)
          .deposite(0, 10000, 10000, 20000)
      ).wait();
      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA);
      expect(reserveB).to.be.eq(_reserveB.add(10000));
      await (
        await customSwanTreasury
          .connect(partner)
          .deposite(10000, 0, 10000, 20000)
      ).wait();
      let __reserveA = await customSwanTreasury.reserveA();
      let __reserveB = await customSwanTreasury.reserveB();
      expect(__reserveA).to.be.eq(reserveA.add(10000));
      expect(__reserveB).to.be.eq(reserveB);
    });

    it("Basic test", async function () {
      // console.log("setting current time ... ");
      currentTime = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      // console.log("current timestamp = ", currentTime);
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

    it("preinform fails if zero token0/token1 amount", async () => {
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

    it("withdraw fails if it exceeds the preInformed amount", async () => {
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
          currentContracTime.add(86400 * 90)
        )
      ).wait();
      await expect(
        customSwanTreasury.connect(partner).withdraw(200, 200)
      ).to.be.revertedWith("ERR: amount exceed");
    });

    it("withdraw if the amount doesn't exceed the preinformed amount", async () => {
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
          currentContracTime.add(86400 * 90)
        )
      ).wait();
      let _reserveA = await customSwanTreasury.reserveA();
      let _reserveB = await customSwanTreasury.reserveB();
      await (
        await customSwanTreasury.connect(partner).withdraw(100, 100)
      ).wait();
      let reserveA = await customSwanTreasury.reserveA();
      let reserveB = await customSwanTreasury.reserveB();
      expect(reserveA).to.be.eq(_reserveA.sub(100));
      expect(reserveB).to.be.eq(_reserveB.sub(100));
    });

    it("withdraw 20 percent of the profit", async () => {
      currentTime = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();

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
        await customSwanTreasury.setCurrentTime(currentTime + 86400 * 90)
      ).wait();
      await (
        await customSwanTreasury
          .connect(trader)
          .withdrawFee(15000, 25000, token1.address, owner.address)
      ).wait();
      reserveA = await customSwanTreasury.reserveA();
      reserveB = await customSwanTreasury.reserveB();
      expect(reserveB.toNumber()).to.be.eq(9202);
    });
    it("withdraw fails if not enough time", async () => {
      currentTime = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();
      await (
        await customSwanTreasury.setLastFeeWithdrawedTime(currentTime)
      ).wait();

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
      await expect(
        customSwanTreasury
          .connect(trader)
          .withdrawFee(15000, 25000, token1.address, owner.address)
      ).to.be.revertedWith("ERR: already withdrawed for the current epoch");
    });
    it("withdraw fails if not trader", async () => {
      currentTime = (
        await ethers.provider.getBlock(await ethers.provider.getBlockNumber())
      ).timestamp;
      await (await customSwanTreasury.setCurrentTime(currentTime + 10)).wait();
      await (
        await customSwanTreasury.setLastFeeWithdrawedTime(currentTime)
      ).wait();

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
        await customSwanTreasury.setCurrentTime(currentTime + 86400 * 90)
      ).wait();
      await expect(
        customSwanTreasury
          .connect(addrs[0])
          .withdrawFee(15000, 25000, token1.address, owner.address)
      ).to.be.revertedWith("you're not the allowed trader");
    });
  });
});
