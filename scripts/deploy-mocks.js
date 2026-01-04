//to get wbtc and usdc mock address on sepolia

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();

  const wbtc = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8);
  await wbtc.waitForDeployment();

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  console.log("WETH:", await weth.getAddress());
  console.log("WBTC:", await wbtc.getAddress());
  console.log("USDC:", await usdc.getAddress());
}

main().catch(console.error);
