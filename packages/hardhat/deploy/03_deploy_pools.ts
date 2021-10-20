import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { createUniPool } from '../test/setup'

import { getDai, getWETH, getUniswapDeployments } from '../tasks/utils'
import { oracleScaleFactor } from '../test/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers, network } = hre;
  const { deployer } = await getNamedAccounts();

  const { positionManager, uniswapFactory } = await getUniswapDeployments(ethers, deployer, network.name)
  
  // Get Tokens
  const weth9 = await getWETH(ethers, deployer, network.name)
  const dai = await getDai(ethers, deployer, network.name);

  // Create ETH/SQUEETH Pool with positionManager
  const squeeth = await ethers.getContract("WSqueeth", deployer);
  
  // update this number to initial price we want to start the pool with.
  
  const squeethPriceInEth = 4000 / oracleScaleFactor.toNumber(); 
  const squeethWethPool = await createUniPool(squeethPriceInEth, weth9, squeeth, positionManager, uniswapFactory)
  const tx1 = await squeethWethPool.increaseObservationCardinalityNext(128) 
  await ethers.provider.waitForTransaction(tx1.hash, 1)

  const ethPriceInDai = 4000
  const ethDaiPool = await createUniPool(ethPriceInDai, dai, weth9, positionManager, uniswapFactory)
  const tx2 = await ethDaiPool.increaseObservationCardinalityNext(128)
  await ethers.provider.waitForTransaction(tx2.hash, 1)

  console.log(`SQU/ETH Pool created 🐑. Address: ${squeethWethPool.address}`)
  console.log(`ETH/DAI Pool created 🐑. Address: ${ethDaiPool.address}`)
}

export default func;