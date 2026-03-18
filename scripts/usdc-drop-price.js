const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load latest deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json"))
    .sort(
      (a, b) =>
        fs.statSync(path.join(deploymentsDir, b)).mtime.getTime() -
        fs.statSync(path.join(deploymentsDir, a)).mtime.getTime(),
    );

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, files[0]), "utf8"),
  );

  const USDC_PRICE_FEED = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const usdcAddress = deployment.tokens.USDC;

  const feed = await ethers.getContractAt("MockV3Aggregator", USDC_PRICE_FEED);

  // Read price BEFORE
  const before = await feed.latestRoundData();
  console.log("Price before:", before.answer.toString());

  await feed.updateAnswer(50_000_000);

  // Read price AFTER
  const after = await feed.latestRoundData();
  console.log("Price after:", after.answer.toString());
  console.log("✅ USDC price dropped to $0.50");

  // Verify PriceOracle is using the same feed
  const priceOracle = await ethers.getContractAt(
    "PriceOracle",
    deployment.contracts.priceOracle,
  );
  const feedInOracle = await priceOracle.priceFeeds(usdcAddress);
  console.log("Feed registered in PriceOracle for USDC:", feedInOracle);
  console.log("Feed you updated:                        ", USDC_PRICE_FEED);
  console.log(
    "Match:",
    feedInOracle.toLowerCase() === USDC_PRICE_FEED.toLowerCase(),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
