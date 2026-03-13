const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("XCMPrecompile", function () {
  const XCM_PRECOMPILE = "0x00000000000000000000000000000000000A0000";
  const EXAMPLE_XCM = "0x050c000401000003008c86471301000003008c8647000d010101000000010100368e8759910dab756d344995f1d3c79374ca8f70066d3a709e48029f6bf0ee7e";

  let xcmTreasury;
  let deployer;

  before(async function () {
    [deployer] = await ethers.getSigners();
    const C = await ethers.getContractFactory("XCMTreasuryDispatch");
    xcmTreasury = await C.deploy(deployer.address);
    await xcmTreasury.waitForDeployment();
  });

  it("XCM precompile exists", async function () {
    const code = await ethers.provider.getCode(XCM_PRECOMPILE);
    expect(code).to.not.equal("0x");
  });

  it("weighMessage returns nonzero weight", async function () {
    const weight = await xcmTreasury.weighTreasuryMessage(EXAMPLE_XCM);
    expect(weight.refTime).to.be.gt(0n);
  });

  it("treasury set correctly", async function () {
    expect(await xcmTreasury.treasury()).to.equal(deployer.address);
  });

  it("totalDispatched starts zero", async function () {
    expect(await xcmTreasury.totalDispatched()).to.equal(0n);
  });
});
