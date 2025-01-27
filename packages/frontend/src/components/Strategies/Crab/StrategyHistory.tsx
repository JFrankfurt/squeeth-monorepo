import { useCrabStrategyTxHistory } from '@hooks/useCrabAuctionHistory'
import { IconButton, Typography } from '@material-ui/core'
import { createStyles, makeStyles } from '@material-ui/core/styles'
import React, { useState } from 'react'
import { EtherscanPrefix } from '../../../constants'
import OpenInNewIcon from '@material-ui/icons/OpenInNew'
import { useWallet } from '@context/wallet'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'
import KeyboardArrowDownOutlinedIcon from '@material-ui/icons/KeyboardArrowDownOutlined'
import { GreyButton } from '@components/Button'
import { useUserCrabTxHistory } from '@hooks/useUserCrabTxHistory'
import { CrabStrategyTxType, Networks } from '../../../types/index'
import clsx from 'clsx'

const useStyles = makeStyles((theme) =>
  createStyles({
    container: {
      marginBottom: theme.spacing(10),
    },
    txItem: {
      background: theme.palette.background.stone,
      borderRadius: theme.spacing(1),
      padding: theme.spacing(1, 2),
      marginTop: theme.spacing(3),
      display: 'flex',
    },
    txSubItemTitle: {
      width: '37%',
    },
    txSubItem: {
      width: '30%',
    },
    txLink: {
      width: '3%',
    },
    green: {
      color: theme.palette.success.main,
    },
    red: {
      color: theme.palette.error.main,
    },
  }),
)

enum TxType {
  HEDGES = 'Hedges',
  MY_TX = 'My Transactions',
}

export const CrabStrategyHistory: React.FC = () => {
  const classes = useStyles()
  const { data, loading } = useCrabStrategyTxHistory()
  const { networkId, address } = useWallet()

  const [txType, setTxType] = useState(TxType.HEDGES)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleItemClick = (type: TxType) => {
    setTxType(type)
    setAnchorEl(null)
  }

  return (
    <div className={classes.container}>
      <div style={{ display: 'flex', marginTop: '32px' }}>
        <Typography variant="h5" color="primary" style={{}}>
          Strategy History
        </Typography>
        <GreyButton
          aria-controls="simple-menu"
          aria-haspopup="true"
          style={{ marginLeft: '16px', width: '200px' }}
          onClick={handleClick}
          endIcon={<KeyboardArrowDownOutlinedIcon color="primary" />}
        >
          {txType}
        </GreyButton>
        <Menu id="simple-menu" anchorEl={anchorEl} keepMounted open={Boolean(anchorEl)} onClose={handleClose}>
          <MenuItem onClick={() => handleItemClick(TxType.HEDGES)}>Hedges</MenuItem>
          {!!address ? <MenuItem onClick={() => handleItemClick(TxType.MY_TX)}>My Transactions</MenuItem> : null}
        </Menu>
      </div>
      {!!address && txType === TxType.MY_TX ? <UserCrabHistory user={address} networkId={networkId} /> : null}
      {txType === TxType.HEDGES ? (
        <div>
          {data?.map((d) => {
            return (
              <div className={classes.txItem} key={d.id}>
                <div className={classes.txSubItemTitle}>
                  <Typography variant="subtitle1">Hedge</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {new Date(d.timestamp * 1000).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: 'numeric',
                    })}
                  </Typography>
                </div>
                <div className={clsx(classes.txSubItem, d.isSellingSqueeth ? classes.red : classes.green)}>
                  <Typography variant="subtitle1">
                    <b style={{ fontWeight: 600 }}>{d.oSqueethAmount.toFixed(6)}</b> oSQTH
                  </Typography>
                </div>
                <div className={clsx(classes.txSubItem, d.isSellingSqueeth ? classes.green : classes.red)}>
                  <Typography variant="subtitle1">
                    <b style={{ fontWeight: 600 }}>{d.ethAmount.toFixed(6)}</b> ETH
                  </Typography>
                </div>
                <div className={classes.txLink}>
                  <IconButton size="small" href={`${EtherscanPrefix[networkId]}/${d.id}`} target="_blank">
                    <OpenInNewIcon style={{ fontSize: '16px' }} color="secondary" />
                  </IconButton>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

const UserCrabHistory: React.FC<{ user: string; networkId: Networks }> = ({ user, networkId }) => {
  const classes = useStyles()
  const { data } = useUserCrabTxHistory(user, true)

  return (
    <>
      {data?.map((d) => {
        return (
          <div className={classes.txItem} key={d.id}>
            <div className={classes.txSubItemTitle}>
              <Typography variant="subtitle1">{d.txTitle}</Typography>
              <Typography variant="caption" color="textSecondary">
                {new Date(d.timestamp * 1000).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: 'numeric',
                })}
              </Typography>
            </div>
            <div className={classes.txSubItem}>
              <Typography
                variant="subtitle1"
                className={d.type === CrabStrategyTxType.FLASH_DEPOSIT ? classes.red : classes.green}
              >
                <b style={{ fontWeight: 600 }}>{d.ethAmount.toFixed(6)}</b> ETH
              </Typography>
              <Typography variant="caption" color="textSecondary">
                ${d.ethUsdValue.toFixed(2)}
              </Typography>
            </div>
            <div className={classes.txSubItem} />
            <div className={classes.txLink}>
              <IconButton size="small" href={`${EtherscanPrefix[networkId]}/${d.id}`} target="_blank">
                <OpenInNewIcon style={{ fontSize: '16px' }} color="secondary" />
              </IconButton>
            </div>
          </div>
        )
      })}
    </>
  )
}

export default CrabStrategyHistory
