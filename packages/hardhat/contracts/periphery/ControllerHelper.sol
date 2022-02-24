//SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.7.6;
pragma abicoder v2;

import "hardhat/console.sol";

// interface
import {IWETH9} from "../interfaces/IWETH9.sol";
import {IWPowerPerp} from "../interfaces/IWPowerPerp.sol";
import {IShortPowerPerp} from "../interfaces/IShortPowerPerp.sol";
import {IOracle} from "../interfaces/IOracle.sol";
import {IController} from "../interfaces/IController.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

// contract
import {Strings} from '@openzeppelin/contracts/utils/Strings.sol';
import {FlashControllerHelper} from "./FlashControllerHelper.sol";

// lib
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";

contract ControllerHelper is FlashControllerHelper, IERC721Receiver {
    using SafeMath for uint256;
    using Address for address payable;
    using Strings for uint256;
    
    /// @dev enum to differentiate between uniswap swap callback function source
    enum CALLBACK_SOURCE {
        FLASH_W_MINT,
        FLASH_W_BURN,
        FLASH_W_MINT_DEPOSIT_NFT
    }

    address public immutable controller;
    address public immutable oracle;
    address public immutable shortPowerPerp;
    address public immutable wPowerPerpPool;
    address public immutable wPowerPerp;
    address public immutable weth;
    address public immutable swapRouter;
    address public immutable nonfungiblePositionManager;
    address public immutable wPowerPerpPoolToken0;
    address public immutable wPowerPerpPoolToken1;

    struct FlashswapWMintData {
        uint256 vaultId;
        uint256 flashSwappedCollateral;
        uint256 totalCollateralToDeposit;
        uint256 wPowerPerpAmount;
    }
    struct FlashswapWBurnData {
        uint256 vaultId;
        uint256 wPowerPerpAmountToBurn;
        uint256 wPowerPerpAmountToBuy;
        uint256 collateralToWithdraw;
        uint256 collateralToBuyWith;
    }
    struct FlashswapWMintDepositNftData {
        uint256 vaultId;
        uint256 wPowerPerpAmount;
        uint256 collateralToMint;
        uint256 collateralToLP;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 lowerTick;
        uint256 upperTick;
        uint256 lowerTickSign;
        uint256 upperTickSign;
    }

    event FlashswapWMint(
        address indexed depositor,
        uint256 vaultId,
        uint256 wPowerPerpAmount,
        uint256 swapedCollateralAmount,
        uint256 collateralAmount
    );
    event FlashWBurn(
        address indexed withdrawer,
        uint256 vaultId,
        uint256 wPowerPerpAmountToBurn,
        uint256 collateralAmountToWithdraw,
        uint256 wPowerPerpAmountToBuy
    );
    event BatchMintLp(
        address indexed depositor,
        uint256 vaultId,
        uint256 wPowerPerpAmount,
        uint256 collateralToMint,
        uint256 collateralToLP
    );

    constructor(
        address _controller,
        address _oracle,
        address _shortPowerPerp,
        address _wPowerPerpPool,
        address _wPowerPerp,
        address _weth,
        address _swapRouter,
        address _nonfungiblePositionManager,
        address _uniswapFactory
    ) FlashControllerHelper(_uniswapFactory) {
        controller = _controller;
        oracle = _oracle;
        shortPowerPerp = _shortPowerPerp;
        wPowerPerpPool = _wPowerPerpPool;
        wPowerPerp = _wPowerPerp;
        weth = _weth;
        swapRouter = _swapRouter;
        nonfungiblePositionManager = _nonfungiblePositionManager;
        wPowerPerpPoolToken0 = IUniswapV3Pool(_wPowerPerpPool).token0();
        wPowerPerpPoolToken1 = IUniswapV3Pool(_wPowerPerpPool).token1();

        IWPowerPerp(_wPowerPerp).approve(_swapRouter, type(uint256).max);
        IWETH9(_weth).approve(_swapRouter, type(uint256).max);
        IWPowerPerp(_wPowerPerp).approve(_nonfungiblePositionManager, type(uint256).max);
        IWETH9(_weth).approve(_nonfungiblePositionManager, type(uint256).max);
    }

    /**
     * @dev accept erc721 from safeTransferFrom and safeMint after callback
     * @return returns received selector
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @notice receive function to allow ETH transfer to this contract
     */
    receive() external payable {
        require(msg.sender == weth || msg.sender == address(controller), "Cannot receive eth");
    }

    /**
     * @notice flash mint WPowerPerp using flashswap
     * @param _vaultId vault ID
     * @param _wPowerPerpAmount amount of WPowerPerp to mint
     * @param _collateralAmount total collateral amount to deposit
     */
    function flashswapWMint(
        uint256 _vaultId,
        uint256 _wPowerPerpAmount,
        uint256 _collateralAmount
    ) external payable {
        uint256 amountToFlashswap = _collateralAmount.sub(msg.value);

        _exactInFlashSwap(
            wPowerPerp,
            weth,
            IUniswapV3Pool(wPowerPerpPool).fee(),
            _wPowerPerpAmount,
            amountToFlashswap,
            uint8(CALLBACK_SOURCE.FLASH_W_MINT),
            abi.encodePacked(_vaultId, amountToFlashswap, _collateralAmount, _wPowerPerpAmount)
        );

        emit FlashswapWMint(msg.sender, _vaultId, _wPowerPerpAmount, amountToFlashswap, _collateralAmount);
    }

    /**
     * @notice flash close position and buy long squeeth
     * @dev this function
     * @param _vaultId vault ID
     * @param _wPowerPerpAmountToBurn amount of WPowerPerp to burn
     * @param _wPowerPerpAmountToBuy amount of WPowerPerp to buy
     * @param _collateralToWithdraw amount of collateral to withdraw from vault
     * @param _collateralToBuyWith amount of collateral from vault to use to buy long
     */
    function flashswapWBurnBuyLong(
        uint256 _vaultId,
        uint256 _wPowerPerpAmountToBurn,
        uint256 _wPowerPerpAmountToBuy,
        uint256 _collateralToWithdraw,
        uint256 _collateralToBuyWith
    ) external payable {
        require(_collateralToBuyWith <= _collateralToWithdraw.add(msg.value), "Not enough collateral");

        _exactOutFlashSwap(
            weth,
            wPowerPerp,
            IUniswapV3Pool(wPowerPerpPool).fee(),
            _wPowerPerpAmountToBurn.add(_wPowerPerpAmountToBuy),
            _collateralToBuyWith.add(msg.value),
            uint8(CALLBACK_SOURCE.FLASH_W_BURN),
            abi.encodePacked(
                _vaultId,
                _wPowerPerpAmountToBurn,
                _wPowerPerpAmountToBuy,
                _collateralToWithdraw,
                _collateralToBuyWith.add(msg.value)
            )
        );

        emit FlashWBurn(msg.sender, _vaultId, _wPowerPerpAmountToBurn, _collateralToWithdraw, _wPowerPerpAmountToBuy);
    }

    /**
     * @notice mint WPowerPerp and LP into Uniswap v3 pool
     * @param _vaultId vault ID
     * @param _wPowerPerpAmount amount of WPowerPerp token to mint
     * @param _collateralToMint collateral to use for minting
     * @param _collateralToLP collateral to use for LPing
     * @param _lowerTick LP lower tick
     * @param _upperTick LP upper tick
     */
    function batchMintLp(
        uint256 _vaultId,
        uint256 _wPowerPerpAmount,
        uint256 _collateralToMint,
        uint256 _collateralToLP,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _deadline,
        int24 _lowerTick,
        int24 _upperTick
    ) external payable {
        require(msg.value == _collateralToMint.add(_collateralToLP), "Wrong ETH sent");

        uint256 vaultId = IController(controller).mintWPowerPerpAmount{value: _collateralToMint}(
            _vaultId,
            _wPowerPerpAmount,
            0
        );
        uint256 amount0Desired = wPowerPerpPoolToken0 == wPowerPerp ? _wPowerPerpAmount : _collateralToLP;
        uint256 amount1Desired = wPowerPerpPoolToken1 == wPowerPerp ? _wPowerPerpAmount : _collateralToLP;

        _lpWPowerPerpPool(
            msg.sender,
            _collateralToLP,
            amount0Desired,
            amount1Desired,
            _amount0Min,
            _amount1Min,
            _deadline,
            _lowerTick,
            _upperTick
        );

        if (_vaultId == 0) IShortPowerPerp(shortPowerPerp).safeTransferFrom(address(this), msg.sender, vaultId);
        if (address(this).balance > 0) {
            payable(msg.sender).sendValue(address(this).balance);
        }
        uint256 remainingWPowerPerp = IWPowerPerp(wPowerPerp).balanceOf(address(this));
        if (remainingWPowerPerp > 0) {
            IWPowerPerp(wPowerPerp).transfer(msg.sender, remainingWPowerPerp);
        }

        emit BatchMintLp(msg.sender, _vaultId, _wPowerPerpAmount, _collateralToMint, _collateralToLP);
    }

    function flashswapWMintDepositNft(
        uint256 _vaultId,
        uint256 _wPowerPerpAmount,
        uint256 _collateralAmount,
        uint256 _amount0Min,
        uint256 _amount1Min,
        int24 _lowerTick,
        int24 _upperTick
    ) external payable {
        uint256 collateralToMint = _collateralAmount.sub(msg.value);
        uint256 amount0;
        uint256 amount1;
        (wPowerPerpPoolToken0 == wPowerPerp) ? amount1 = collateralToMint : amount0 = collateralToMint;

        console.log(_lowerTick < 0);

        _flashLoan(
            abi.encodePacked(
                _vaultId,
                _wPowerPerpAmount,
                collateralToMint,
                msg.value,
                _amount0Min,
                _amount1Min,
                uint256(_lowerTick),
                uint256(_upperTick),
                (_lowerTick < 0) ? uint256(0) : uint256(1),
                (_upperTick < 0) ? uint256(0) : uint256(1)
            ),
            wPowerPerp,
            weth,
            IUniswapV3Pool(wPowerPerpPool).fee(),
            amount0,
            amount1,
            uint8(CALLBACK_SOURCE.FLASH_W_MINT_DEPOSIT_NFT)
        );

    }

    /**
     * @notice uniswap flash swap callback function
     * @dev this function will be called by flashswap callback function uniswapV3SwapCallback()
     * @param _caller address of original function caller
     * @param _amountToPay amount to pay back for flashswap
     * @param _callData arbitrary data attached to callback
     * @param _callSource identifier for which function triggered callback
     */
    function _swapCallback(
        address _caller,
        address, /*_tokenIn*/
        address, /*_tokenOut*/
        uint24, /*_fee*/
        uint256 _amountToPay,
        bytes memory _callData,
        uint8 _callSource
    ) internal override {
        if (CALLBACK_SOURCE(_callSource) == CALLBACK_SOURCE.FLASH_W_MINT) {
            FlashswapWMintData memory data = abi.decode(_callData, (FlashswapWMintData));

            // convert WETH to ETH as Uniswap uses WETH
            IWETH9(weth).withdraw(IWETH9(weth).balanceOf(address(this)));

            //will revert if data.flashSwappedCollateral is > eth balance in contract
            // IController(controller).mintWPowerPerpAmount{value: address(this).balance}(data.vaultId, data.wPowerPerpAmount, 0);
            uint256 vaultId = IController(controller).mintWPowerPerpAmount{value: data.totalCollateralToDeposit}(
                data.vaultId,
                data.wPowerPerpAmount,
                0
            );

            //repay the flash swap
            IWPowerPerp(wPowerPerp).transfer(wPowerPerpPool, _amountToPay);

            if (address(this).balance > 0) {
                payable(_caller).sendValue(address(this).balance);
            }

            // this is a newly open vault, transfer to the user
            if (data.vaultId == 0) IShortPowerPerp(shortPowerPerp).safeTransferFrom(address(this), _caller, vaultId);
        } else if (CALLBACK_SOURCE(_callSource) == CALLBACK_SOURCE.FLASH_W_BURN) {
            FlashswapWBurnData memory data = abi.decode(_callData, (FlashswapWBurnData));

            IController(controller).burnWPowerPerpAmount(
                data.vaultId,
                data.wPowerPerpAmountToBurn,
                data.collateralToWithdraw
            );
            IWETH9(weth).deposit{value: _amountToPay}();
            IWETH9(weth).transfer(wPowerPerpPool, _amountToPay);
            IWPowerPerp(wPowerPerp).transfer(_caller, data.wPowerPerpAmountToBuy);

            if (address(this).balance > 0) {
                payable(_caller).sendValue(address(this).balance);
            }
        }
    }

    /**
     * @notice uniswap flash loan callback function
     * @dev this function will be called by flashswap callback function IUniswapV3FlashCallback()
     * @param _fee0 fee amount to repay for token0 loan
     * @param _fee1 fee amount to repay for token1 loan
     * @param _callData arbitrary data attached to callback
     * @param _callSource identifier for which function triggered callback
     */
    function _flashCallback(
        uint256 _fee0,
        uint256 _fee1,
        bytes memory _callData,
        uint8 _callSource
    ) internal override {
        if (CALLBACK_SOURCE(_callSource) == CALLBACK_SOURCE.FLASH_W_MINT_DEPOSIT_NFT) {
            FlashswapWMintDepositNftData memory data = abi.decode(_callData, (FlashswapWMintDepositNftData));

            // convert WETH to ETH as Uniswap uses WETH
            IWETH9(weth).withdraw(IWETH9(weth).balanceOf(address(this)));

            uint256 vaultId = IController(controller).mintWPowerPerpAmount{value: data.collateralToMint}(
                data.vaultId,
                data.wPowerPerpAmount,
                0
            );

            uint256 amount0Desired = wPowerPerpPoolToken0 == wPowerPerp ? data.wPowerPerpAmount : data.collateralToLP;
            uint256 amount1Desired = wPowerPerpPoolToken1 == wPowerPerp ? data.wPowerPerpAmount : data.collateralToLP;
            uint256 tokenId = _lpWPowerPerpPool(
                address(this),
                data.collateralToLP,
                amount0Desired,
                amount1Desired,
                data.amount0Min,
                data.amount1Min,
                block.timestamp,
                int24(data.lowerTick),
                int24(data.upperTick)
            );

            IController(controller).mintWPowerPerpAmount(vaultId, 0, tokenId);

            uint256 amountToRepay = _fee0 > 0 ? _fee0 : _fee1;

            IController(controller).withdraw(vaultId, amountToRepay);

            IWETH9(weth).deposit{value: amountToRepay}();
            IWETH9(weth).transfer(wPowerPerpPool, amountToRepay);
        }
    }

    /**
     * @notice LP into Uniswap V3 pool
     */
    function _lpWPowerPerpPool(
        address _recipient,
        uint256 _ethAmount,
        uint256 _amount0Desired,
        uint256 _amount1Desired,
        uint256 _amount0Min,
        uint256 _amount1Min,
        uint256 _deadline,
        int24 _lowerTick,
        int24 _upperTick
    ) private returns (uint256) {
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: wPowerPerpPoolToken0,
            token1: wPowerPerpPoolToken1,
            fee: IUniswapV3Pool(wPowerPerpPool).fee(),
            tickLower: _lowerTick,
            tickUpper: _upperTick,
            amount0Desired: _amount0Desired,
            amount1Desired: _amount1Desired,
            amount0Min: _amount0Min,
            amount1Min: _amount1Min,
            recipient: _recipient,
            deadline: _deadline
        });

        (uint256 tokenId, , , ) = INonfungiblePositionManager(nonfungiblePositionManager).mint{value: _ethAmount}(
            params
        );

        return tokenId;
    }

    function tickToString(int24 tick) private pure returns (string memory) {
        string memory sign = '';
        if (tick < 0) {
            tick = tick * -1;
            sign = '-';
        }
        return string(abi.encodePacked(sign, uint256(tick).toString()));
    }

}
