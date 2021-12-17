import { Address, BigInt, log } from "@graphprotocol/graph-ts"
import {
  Controller,
  BurnShort,
  DepositCollateral,
  DepositUniPositionToken,
  FeeRateUpdated,
  FeeRecipientUpdated,
  Liquidate,
  MintShort,
  NormalizationFactorUpdated,
  OpenVault,
  OwnershipTransferred,
  Paused,
  RedeemLong,
  RedeemShort,
  ReduceDebt,
  Shutdown,
  UnPaused,
  UpdateOperator,
  WithdrawCollateral,
  WithdrawUniPositionToken
} from "../generated/Controller/Controller"
import { Vault, Liquidation, NormalizationFactorUpdate } from "../generated/schema"
import { loadOrCreateAccount, BIGINT_ONE, BIGINT_ZERO } from "./util"

// Note: If a handler doesn't require existing field values, it is faster
// _not_ to load the entity from the store. Instead, create it fresh with
// `new Entity(...)`, set the fields that should be updated and save the
// entity back to the store. Fields that were not set or unset remain
// unchanged, allowing for partial updates to be applied.

// It is also possible to access smart contracts from mappings. For
// example, the contract that has emitted the event can be connected to
// with:
//
// let contract = Contract.bind(event.address)
//
// The following functions can then be called on this contract to access
// state variables and other data:
//
// - contract.FUNDING_PERIOD(...)
// - contract.TWAP_PERIOD(...)
// - contract.burnPowerPerpAmount(...)
// - contract.ethQuoteCurrencyPool(...)
// - contract.feeRate(...)
// - contract.feeRecipient(...)
// - contract.getDenormalizedMark(...)
// - contract.getDenormalizedMarkForFunding(...)
// - contract.getExpectedNormalizationFactor(...)
// - contract.getIndex(...)
// - contract.getUnscaledIndex(...)
// - contract.indexForSettlement(...)
// - contract.isShutDown(...)
// - contract.isSystemPaused(...)
// - contract.isVaultSafe(...)
// - contract.lastFundingUpdateTimestamp(...)
// - contract.lastPauseTime(...)
// - contract.liquidate(...)
// - contract.normalizationFactor(...)
// - contract.onERC721Received(...)
// - contract.oracle(...)
// - contract.owner(...)
// - contract.pausesLeft(...)
// - contract.quoteCurrency(...)
// - contract.shortPowerPerp(...)
// - contract.vaults(...)
// - contract.wPowerPerp(...)
// - contract.wPowerPerpPool(...)
// - contract.weth(...)

export function handleBurnShort(event: BurnShort): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.shortAmount = vault.shortAmount.minus(event.params.amount)
  vault.save()
}

export function handleDepositCollateral(event: DepositCollateral): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.collateralAmount = vault.collateralAmount.plus(event.params.amount)
  vault.save()
}

export function handleDepositUniPositionToken(
  event: DepositUniPositionToken
): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.NftCollateralId = event.params.tokenId
  vault.save()
}

export function handleFeeRateUpdated(event: FeeRateUpdated): void { }

export function handleFeeRecipientUpdated(event: FeeRecipientUpdated): void { }

export function handleLiquidate(event: Liquidate): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.shortAmount = vault.shortAmount.minus(event.params.debtAmount)
  vault.collateralAmount = vault.collateralAmount.minus(event.params.collateralPaid)
  vault.save()

  const liquidation = new Liquidation(`${event.transaction.hash.toHex()}-${event.logIndex.toString()}`)
  liquidation.debtAmount = event.params.debtAmount
  liquidation.collateralPaid = event.params.collateralPaid
  liquidation.vaultId = event.params.vaultId
  liquidation.liquidator = event.params.liquidator
  liquidation.save()
}

export function handleMintShort(event: MintShort): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.shortAmount = vault.shortAmount.plus(event.params.amount)
  vault.save()
}

export function handleNormalizationFactorUpdated(
  event: NormalizationFactorUpdated
): void {
  const nfUpdate = new NormalizationFactorUpdate(`${event.transaction.hash.toHex()}-${event.logIndex.toString()}`)
  nfUpdate.newNormFactor = event.params.newNormFactor
  nfUpdate.oldNormFactor = event.params.oldNormFactor
  nfUpdate.timestamp = event.params.timestamp
  nfUpdate.lastModificationTimestamp = event.params.lastModificationTimestamp
  nfUpdate.save()
}

export function handleOpenVault(event: OpenVault): void {
  const account = loadOrCreateAccount(event.transaction.from.toHex())
  account.vaultCount = account.vaultCount.plus(BIGINT_ONE)
  account.save()

  const vault = new Vault(event.params.vaultId.toString())
  vault.owner = event.transaction.from.toHex()
  vault.collateralAmount = BIGINT_ZERO
  vault.shortAmount = BIGINT_ZERO
  vault.save()
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void { }

export function handlePaused(event: Paused): void { }

export function handleRedeemLong(event: RedeemLong): void { }

export function handleRedeemShort(event: RedeemShort): void { }

export function handleReduceDebt(event: ReduceDebt): void { }

export function handleShutdown(event: Shutdown): void { }

export function handleUnPaused(event: UnPaused): void { }

export function handleUpdateOperator(event: UpdateOperator): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.operator = event.params.operator
  vault.save()
}

export function handleWithdrawCollateral(event: WithdrawCollateral): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.collateralAmount = vault.collateralAmount.minus(event.params.amount)
  vault.save()
}

export function handleWithdrawUniPositionToken(
  event: WithdrawUniPositionToken
): void {
  const vault = Vault.load(event.params.vaultId.toString())
  if (!vault) return

  vault.NftCollateralId = BIGINT_ZERO
  vault.save()
}