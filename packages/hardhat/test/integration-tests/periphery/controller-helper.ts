import { ethers } from "hardhat"
import { expect } from "chai";
import { Contract, BigNumber, providers } from "ethers";
import BigNumberJs from 'bignumber.js'

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { WETH9, MockErc20, ShortPowerPerp, Controller, Oracle, WPowerPerp, ControllerHelper, INonfungiblePositionManager} from "../../../typechain";
import { deployUniswapV3, deploySqueethCoreContracts, deployWETHAndDai, addWethDaiLiquidity, addSqueethLiquidity } from '../../setup'
import { isSimilar, wmul, wdiv, one, oracleScaleFactor, getNow } from "../../utils"

BigNumberJs.set({EXPONENTIAL_AT: 30})

describe("Controller helper integration test", function () {
  const startingEthPrice = 3000
  const startingEthPrice1e18 = BigNumber.from(startingEthPrice).mul(one) // 3000 * 1e18
  const scaledStartingSqueethPrice1e18 = startingEthPrice1e18.div(oracleScaleFactor) // 0.3 * 1e18
  const scaledStartingSqueethPrice = startingEthPrice / oracleScaleFactor.toNumber() // 0.3


  let provider: providers.JsonRpcProvider;
  let owner: SignerWithAddress;
  let depositor: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let dai: MockErc20
  let weth: WETH9
  let positionManager: Contract
  let uniswapFactory: Contract
  let uniswapRouter: Contract
  let oracle: Oracle
  let controller: Controller
  let wSqueethPool: Contract
  let wSqueeth: WPowerPerp
  let ethDaiPool: Contract
  let controllerHelper: ControllerHelper
  let shortSqueeth: ShortPowerPerp


  this.beforeAll("Deploy uniswap protocol & setup uniswap pool", async() => {
    const accounts = await ethers.getSigners();
    const [_owner, _depositor, _feeRecipient ] = accounts;
    owner = _owner;
    depositor = _depositor;
    feeRecipient = _feeRecipient
    provider = ethers.provider

    const { dai: daiToken, weth: wethToken } = await deployWETHAndDai()

    dai = daiToken
    weth = wethToken

    const uniDeployments = await deployUniswapV3(weth)
    positionManager = uniDeployments.positionManager
    uniswapFactory = uniDeployments.uniswapFactory
    uniswapRouter = uniDeployments.swapRouter

    // this will not deploy a new pool, only reuse old onces
    const squeethDeployments = await deploySqueethCoreContracts(
      weth,
      dai, 
      positionManager, 
      uniswapFactory,
      scaledStartingSqueethPrice,
      startingEthPrice
    )
    controller = squeethDeployments.controller
    wSqueeth = squeethDeployments.wsqueeth
    oracle = squeethDeployments.oracle
    shortSqueeth = squeethDeployments.shortSqueeth
    wSqueethPool = squeethDeployments.wsqueethEthPool
    ethDaiPool = squeethDeployments.ethDaiPool

    await controller.connect(owner).setFeeRecipient(feeRecipient.address);
    await controller.connect(owner).setFeeRate(0)
    
    const ControllerHelperContract = await ethers.getContractFactory("ControllerHelper");
    controllerHelper = (await ControllerHelperContract.deploy(controller.address, oracle.address, shortSqueeth.address, wSqueethPool.address, wSqueeth.address, weth.address, uniswapRouter.address, positionManager.address, uniswapFactory.address)) as ControllerHelper;
  })

  this.beforeAll("Seed pool liquidity", async() => {
    // add liquidity

    await addWethDaiLiquidity(
      startingEthPrice,
      ethers.utils.parseUnits('100'), // eth amount
      owner.address,
      dai,
      weth,
      positionManager
    )
    await provider.send("evm_increaseTime", [600])
    await provider.send("evm_mine", [])

    await addSqueethLiquidity(
      scaledStartingSqueethPrice, 
      '1000000',
      '2000000', 
      owner.address, 
      wSqueeth, 
      weth, 
      positionManager, 
      controller
    )
    await provider.send("evm_increaseTime", [600])
    await provider.send("evm_mine", [])
  })

  describe("Mint short with flash deposit", async () => {
    it("flash mint", async () => {      
      const vaultId = await shortSqueeth.nextId();

      const normFactor = await controller.normalizationFactor()
      const mintWSqueethAmount = ethers.utils.parseUnits('10')
      const mintRSqueethAmount = mintWSqueethAmount.mul(normFactor).div(one)
      const ethPrice = await oracle.getTwap(ethDaiPool.address, weth.address, dai.address, 420, true)
      const scaledEthPrice = ethPrice.div(10000)
      const debtInEth = mintRSqueethAmount.mul(scaledEthPrice).div(one)
      const collateralAmount = debtInEth.mul(3).div(2).add(ethers.utils.parseUnits('0.01'))
      const squeethEthPrice = await oracle.getTwap(wSqueethPool.address, wSqueeth.address, weth.address, 420, true)
      const ethAmountOut = mintWSqueethAmount.mul(squeethEthPrice).div(one)
      const slippage = BigNumber.from(3).mul(BigNumber.from(10).pow(16))
      const value = collateralAmount.sub(ethAmountOut.mul(one.sub(slippage)).div(one))
      const controllerBalanceBefore = await provider.getBalance(controller.address)
      const squeethBalanceBefore = await wSqueeth.balanceOf(depositor.address)
      const vaultBefore = await controller.vaults(vaultId)
      
      await controllerHelper.connect(depositor).flashswapWMint(0, mintWSqueethAmount, collateralAmount, {value: value});

      const controllerBalanceAfter = await provider.getBalance(controller.address)
      const squeethBalanceAfter = await wSqueeth.balanceOf(depositor.address)
      const vaultAfter = await controller.vaults(vaultId)

      expect(controllerBalanceBefore.add(collateralAmount).eq(controllerBalanceAfter)).to.be.true
      expect(squeethBalanceBefore.eq(squeethBalanceAfter)).to.be.true
      expect(vaultBefore.collateralAmount.add(collateralAmount).eq(vaultAfter.collateralAmount)).to.be.true
      expect(vaultBefore.shortAmount.add(mintWSqueethAmount).eq(vaultAfter.shortAmount)).to.be.true
    })

    it("flash close short position and buy long", async () => {
      const vaultId = (await shortSqueeth.nextId()).sub(1);
      await controller.connect(depositor).updateOperator(vaultId, controllerHelper.address)

      const vaultBefore = await controller.vaults(vaultId)
      const longBalanceBefore = await wSqueeth.balanceOf(depositor.address)
      const squeethPrice = await oracle.getTwap(wSqueethPool.address, wSqueeth.address, weth.address, 420, true)
      const squeethToBuy = vaultBefore.collateralAmount.div(squeethPrice)

      await controllerHelper.connect(depositor).flashswapWBurnBuyLong(vaultId, vaultBefore.shortAmount, squeethToBuy, vaultBefore.collateralAmount, vaultBefore.collateralAmount);

      const vaultAfter = await controller.vaults(vaultId)
      const longBalanceAfter = await wSqueeth.balanceOf(depositor.address)

      expect(vaultAfter.shortAmount.eq(BigNumber.from(0))).to.be.true
      expect(vaultAfter.collateralAmount.eq(BigNumber.from(0))).to.be.true
      expect(longBalanceAfter.sub(longBalanceBefore).eq(squeethToBuy)).to.be.true
    })
  })

  describe("Batch mint and LP", async () => {
    it("Batch mint and LP", async () => {
      const vaultId = (await shortSqueeth.nextId()).sub(1);
      const normFactor = await controller.normalizationFactor()
      const mintWSqueethAmount = ethers.utils.parseUnits('10')
      const mintRSqueethAmount = mintWSqueethAmount.mul(normFactor).div(one)
      const ethPrice = await oracle.getTwap(ethDaiPool.address, weth.address, dai.address, 420, true)
      const scaledEthPrice = ethPrice.div(10000)
      const debtInEth = mintRSqueethAmount.mul(scaledEthPrice).div(one)
      const collateralAmount = debtInEth.mul(3).div(2).add(ethers.utils.parseUnits('0.01'))
      const squeethPrice = await oracle.getTwap(wSqueethPool.address, wSqueeth.address, weth.address, 420, true)
      const collateralToLp = mintWSqueethAmount.mul(squeethPrice).div(one)
      const vaultBefore = await controller.vaults(vaultId)
      const tokenIndexBefore = await (positionManager as INonfungiblePositionManager).totalSupply();

      await controllerHelper.connect(depositor).batchMintLp(vaultId, mintWSqueethAmount, collateralAmount, collateralToLp, 0, 0, Math.floor(await getNow(ethers.provider) + 8640000), -887220, 887220, {value: collateralAmount.add(collateralToLp)});

      const vaultAfter = await controller.vaults(vaultId)
      const tokenIndexAfter = await (positionManager as INonfungiblePositionManager).totalSupply();
      const tokenId = await (positionManager as INonfungiblePositionManager).tokenByIndex(tokenIndexAfter.sub(1));
      const ownerOfUniNFT = await (positionManager as INonfungiblePositionManager).ownerOf(tokenId); 
      const position = await (positionManager as INonfungiblePositionManager).positions(tokenId)
      const currentPoolTick = await oracle.getTimeWeightedAverageTickSafe(wSqueethPool.address, 420)

      expect(position.tickLower === -887220).to.be.true
      expect(position.tickUpper === 887220).to.be.true
      expect(ownerOfUniNFT === depositor.address).to.be.true
      expect(tokenIndexAfter.sub(tokenIndexBefore).eq(BigNumber.from(1))).to.be.true
      expect(vaultBefore.shortAmount.eq(BigNumber.from(0))).to.be.true
      expect(vaultBefore.collateralAmount.eq(BigNumber.from(0))).to.be.true
      expect(vaultAfter.shortAmount.eq(mintWSqueethAmount)).to.be.true
      expect(vaultAfter.collateralAmount.eq(collateralAmount)).to.be.true
    })
  })
})