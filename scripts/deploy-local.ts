import { network as hardhatNetwork } from "hardhat";
import type { BytesLike } from "ethers";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PurposeBoundEscrow } from "../types/ethers-contracts/PurposeBoundEscrow.js";

async function main() {
  const { ethers } = await hardhatNetwork.create();
  const networkInfo = await ethers.provider.getNetwork();
  if (networkInfo.chainId !== 31337n) {
    throw new Error("This demo deployment script is restricted to the local Hardhat chain (31337).");
  }

  const [deployer, approver1, approver2, approver3, reviewer] = await ethers.getSigners();
  const configuredVendor = process.env.DEMO_VENDOR_ADDRESS;
  if (configuredVendor && !ethers.isAddress(configuredVendor)) {
    throw new Error("DEMO_VENDOR_ADDRESS must be a valid public wallet address.");
  }
  const vendorAddress = configuredVendor
    ? ethers.getAddress(configuredVendor)
    : deployer.address;
  const category = ethers.encodeBytes32String("community");
  const factory = await ethers.getContractFactory<
    [string, BytesLike, bigint, [string, string, string], string],
    PurposeBoundEscrow
  >("PurposeBoundEscrow");
  const escrow = await factory.deploy(
    "Community support",
    category,
    ethers.parseEther("20"),
    [approver1.address, approver2.address, approver3.address],
    reviewer.address
  );
  await escrow.waitForDeployment();

  await (await escrow.setVendorKeyStatus(vendorAddress, true)).wait();
  await (await escrow.donate(1, { value: ethers.parseEther("10") })).wait();
  if (vendorAddress !== deployer.address) {
    await (await deployer.sendTransaction({
      to: vendorAddress,
      value: ethers.parseEther("1"),
    })).wait();
  }

  const contractAddress = await escrow.getAddress();
  const envPath = resolve(process.cwd(), "client", ".env.local");
  let existingConfig = "";
  try {
    existingConfig = await readFile(envPath, "utf8");
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  const configLines = existingConfig ? existingConfig.split(/\r?\n/) : [];
  const values = {
    VITE_CHAIN_ID: "31337",
    VITE_ESCROW_ADDRESS: contractAddress,
  };
  for (const [key, value] of Object.entries(values)) {
    const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
    const matchingLines = configLines
      .map((line, index) => (keyPattern.test(line) ? index : -1))
      .filter((index) => index >= 0);
    if (matchingLines.length === 0) {
      configLines.push(`${key}=${value}`);
    } else {
      for (const index of matchingLines) configLines[index] = `${key}=${value}`;
    }
  }
  await writeFile(envPath, configLines.join("\n").replace(/\n*$/, "\n"), {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(
    JSON.stringify(
      {
        contractAddress,
        chainId: networkInfo.chainId.toString(),
        environmentFile: "client/.env.local",
        campaignId: 1,
        purpose: "Community support",
        category,
        spendingCap: ethers.parseEther("20").toString(),
        seededBalance: ethers.parseEther("10").toString(),
        deployer: deployer.address,
        approvers: [approver1.address, approver2.address, approver3.address],
        reviewer: reviewer.address,
        activeDemoVendor: vendorAddress,
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
