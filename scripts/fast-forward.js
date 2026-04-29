const { network } = require("hardhat");

async function main() {
  const seconds = 70 * 24 * 60 * 60; // 70 days

  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");

  console.log(`⏩ Fast-forwarded ${seconds} seconds`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
