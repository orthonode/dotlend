const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("PriceOracle", function () {
  const TOKEN = "0x000000000000000000000000000000000000dEaD";

  async function deployFixture() {
    const [owner, oracleAddr, user] = await ethers.getSigners();
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setAuthorizedOracle(oracleAddr.address);
    return { oracle, owner, oracleAddr, user };
  }

  describe("setAuthorizedOracle", function () {
    it("owner can set authorized oracle", async function () {
      const { oracle, user } = await loadFixture(deployFixture);
      await oracle.setAuthorizedOracle(user.address);
      expect(await oracle.authorizedOracle()).to.equal(user.address);
    });

    it("non-owner cannot set authorized oracle", async function () {
      const { oracle, user } = await loadFixture(deployFixture);
      await expect(oracle.connect(user).setAuthorizedOracle(user.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts on zero address", async function () {
      const { oracle } = await loadFixture(deployFixture);
      await expect(oracle.setAuthorizedOracle(ethers.ZeroAddress))
        .to.be.revertedWith("PriceOracle: zero address");
    });
  });

  describe("submitPrice", function () {
    it("authorized oracle can submit price", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      const price = ethers.parseEther("8.5");
      await oracle.connect(oracleAddr).submitPrice(TOKEN, price);
      expect(await oracle.prices(TOKEN)).to.equal(price);
    });

    it("unauthorized address cannot submit price", async function () {
      const { oracle, user } = await loadFixture(deployFixture);
      await expect(oracle.connect(user).submitPrice(TOKEN, ethers.parseEther("8.5")))
        .to.be.revertedWith("PriceOracle: unauthorized");
    });

    it("reverts on zero price", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      await expect(oracle.connect(oracleAddr).submitPrice(TOKEN, 0n))
        .to.be.revertedWith("PriceOracle: zero price");
    });

    it("reverts on zero token address", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      await expect(oracle.connect(oracleAddr).submitPrice(ethers.ZeroAddress, ethers.parseEther("1")))
        .to.be.revertedWith("PriceOracle: zero address");
    });

    it("emits PriceUpdated event", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      const price = ethers.parseEther("8.5");
      await expect(oracle.connect(oracleAddr).submitPrice(TOKEN, price))
        .to.emit(oracle, "PriceUpdated");
    });
  });

  describe("getPrice", function () {
    it("returns submitted price", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      const price = ethers.parseEther("8.5");
      await oracle.connect(oracleAddr).submitPrice(TOKEN, price);
      expect(await oracle.getPrice(TOKEN)).to.equal(price);
    });

    it("reverts if no price submitted", async function () {
      const { oracle } = await loadFixture(deployFixture);
      await expect(oracle.getPrice(TOKEN))
        .to.be.revertedWith("PriceOracle: no price");
    });

    it("reverts if price is stale (> 1 hour old)", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      await oracle.connect(oracleAddr).submitPrice(TOKEN, ethers.parseEther("8.5"));
      await time.increase(3601);
      await expect(oracle.getPrice(TOKEN))
        .to.be.revertedWith("PriceOracle: stale price");
    });

    it("returns price at exactly stale threshold boundary", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      const price = ethers.parseEther("8.5");
      await oracle.connect(oracleAddr).submitPrice(TOKEN, price);
      await time.increase(3600);
      expect(await oracle.getPrice(TOKEN)).to.equal(price);
    });
  });

  describe("circuit breaker (K3 — price deviation)", function () {
    it("submitPrice accepts first price with no deviation check", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      // prices[TOKEN] == 0, so no deviation check
      await oracle.connect(oracleAddr).submitPrice(TOKEN, ethers.parseEther("8.5"));
      expect(await oracle.prices(TOKEN)).to.equal(ethers.parseEther("8.5"));
    });

    it("submitPrice reverts when price deviates more than 20%", async function () {
      const { oracle, oracleAddr } = await loadFixture(deployFixture);
      await oracle.connect(oracleAddr).submitPrice(TOKEN, ethers.parseEther("10"));
      // $10 → $7 is a 30% drop — exceeds 20% maxDeviationBps
      await expect(
        oracle.connect(oracleAddr).submitPrice(TOKEN, ethers.parseEther("7"))
      ).to.be.revertedWith("Price deviation too large");
    });
  });
});
