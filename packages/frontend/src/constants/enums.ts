export enum TradeMode {
  Buy,
  Sell,
}

export enum Vaults {
  ETHBear = 'ETH Bear Yield Strategy', // long 1 eth + short squeeth
  CrabVault = 'Crab Strategy', // long 2 eth + short squeeth
  ETHBull = 'ETH Bull Yield Strategy', // long 3 eth + short squeeth
  Custom = 'Custom Strategy', // long x eth + short squeeth
  Short = 'Short Squeeth', //pure short squeeth
}

export enum TransactionType {
  BUY = 'Bought',
  SELL = 'Sold',
  MINT_SHORT = 'Minted and sold',
  BURN_SHORT = 'Bought back and burned',
}

export enum Tooltips {
  ImplVol = 'Implied Volatility (IV) is a market forecast of ETH price movement implied by squeeth',
  UnrealizedPnL = 'Total profit / loss if you were to fully close your position at the current oSQTH price. Resets if you close your position or change position sides (long to short, or vice versa)',
  RealizedPnL = 'Total realized profit / loss for this position through partial closes. Resets if you fully close your position or change position sides (long to short, or vice versa)',
  Mark = 'The price squeeth is trading at',
  Last24AvgFunding = 'Average funding paid over the last 24hrs. Calculated using a 24hr TWAP of Mark - Index',
  CurrentImplFunding = 'Current funding rate calculated using current Mark - Index',
  FundingPayments = 'Funding happens every time the contract is touched',
  oSQTHPrice = 'Price of oSQTH on Uniswap. 10,000 oSQTH = 1 squeeth at Mark price',
  LPPnL = 'PnL = Value of current LP underlying tokens - Value of tokens deposited (at current price)',
  UniswapLoading = 'When you click the Uniswap link, the Uniswap LP page may take a few moments to load. Please wait for it to fully load so it can prefill LP token data.',
  Operator = 'Operator is a contract that mints squeeth, deposits collateral and sells squeeth in single TX. Similarly it also buys back + burns squeeth and withdraws collateral in single TX',
  SellCloseAmount = 'Amount of oSQTH to buy',
  CurrentCollRatio = 'Collateral ratio for current short position',
  SellOpenAmount = 'Amount of ETH collateral',
  LiquidationPrice = 'Price of ETH when liquidation occurs',
  InitialPremium = 'Initial payment you get for selling squeeth on Uniswap',
}
