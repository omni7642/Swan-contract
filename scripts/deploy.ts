// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const [signer] = await ethers.getSigners();
  const NFTFactory = await ethers.getContractFactory("ERC721Drop");
  const NFT = await NFTFactory.deploy(
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000"
  );

  await NFT.deployed();

  console.log("Greeter deployed to:", NFT.address);

  console.log("setting config");
  await (
    await NFT.setDropSaleConfiguration({
      publicSalePrice: "100000000000000000",
      maxSalePurchasePerAddress: 2,
      publicSaleStart: 0,
      publicSaleEnd: 100000000000,
      presaleStart: 0,
      presaleEnd: 10,
      presaleMerkleRoot:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    })
  ).wait();

  console.log("init");
  await (
    await NFT.initialize(
      "A",
      "AA",
      signer.address,
      signer.address,
      1,
      0,
      signer.address,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    )
  ).wait();

  console.log("purchasing...");
  await (await NFT.purchase(1, { value: "100000000000000000" })).wait();

  let bal = await NFT.balanceOf(signer.address);
  console.log("bal = ", bal.toNumber());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
