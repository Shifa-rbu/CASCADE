import { ethers } from "hardhat";

async function main() {
  const [deployer, approver1, approver2, approver3, reviewer, vendor] =
    await ethers.getSigners();
  const category = ethers.encodeBytes32String("community");
  const factory = await ethers.getContractFactory("PurposeBoundEscrow");
  const escrow = await factory.deploy(
    "Community support",
    category,
    ethers.parseEther("20"),
    [approver1.address, approver2.address, approver3.address],
    reviewer.address
  );
  await escrow.waitForDeployment();

  await (await escrow.setVendorKeyStatus(vendor.address, true)).wait();
  await (await escrow.donate(1, { value: ethers.parseEther("10") })).wait();

  console.log(
    JSON.stringify(
      {
        contractAddress: await escrow.getAddress(),
        campaignId: 1,
        purpose: "Community support",
        category,
        spendingCap: ethers.parseEther("20").toString(),
        seededBalance: ethers.parseEther("10").toString(),
        deployer: deployer.address,
        approvers: [approver1.address, approver2.address, approver3.address],
        reviewer: reviewer.address,
        activeDemoVendor: vendor.address,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
