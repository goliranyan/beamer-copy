/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';

import { Transfer } from '@/actions/transfers/transfer';
import * as fillManager from '@/services/transactions/fill-manager';
import * as requestManager from '@/services/transactions/request-manager';
import type { EthereumAddress } from '@/types/data';
import { UInt256 } from '@/types/uint-256';
import {
  generateChain,
  generateRequestFillMetadata,
  generateRequestMetadataData,
  generateStepData,
  generateToken,
  generateTokenAmountData,
  generateTransferData,
  generateUInt256Data,
  getRandomEthereumAddress,
} from '~/utils/data_generators';

vi.mock('@ethersproject/providers');
vi.mock('@/services/transactions/fill-manager');
vi.mock('@/services/transactions/request-manager');

class TestTransfer extends Transfer {
  public getStepMethods(signer: JsonRpcSigner, signerAddress: EthereumAddress) {
    return super.getStepMethods(signer, signerAddress);
  }

  public sendRequestTransaction(signer: JsonRpcSigner, signerAddress: EthereumAddress) {
    return super.sendRequestTransaction(signer, signerAddress);
  }

  public waitForRequestEvent() {
    return super.waitForRequestEvent();
  }

  public waitForFulfillment() {
    return super.waitForFulfillment();
  }
}

const DATA = generateTransferData();
const SIGNER = new JsonRpcSigner(undefined, new JsonRpcProvider());
const SIGNER_ADDRESS = '0xSigner';

describe('transfer', () => {
  beforeEach(() => {
    requestManager!.sendRequestTransaction = vi.fn().mockResolvedValue('0xHash');
    requestManager!.getRequestIdentifier = vi.fn().mockResolvedValue(1);
    fillManager!.waitForFulfillment = vi.fn().mockResolvedValue(undefined);
  });

  it('defines a method for every step', () => {
    const transfer = new TestTransfer(DATA);

    const methods = transfer.getStepMethods(SIGNER, SIGNER_ADDRESS);

    for (const step of transfer.steps) {
      expect(methods[step.identifier]).toBeDefined();
    }
  });

  describe('execute()', () => {
    it('triggers all protocol relevant functions', async () => {
      const transfer = new TestTransfer(DATA);

      await transfer.execute(SIGNER, SIGNER_ADDRESS);

      expect(requestManager.sendRequestTransaction).toHaveBeenCalledTimes(1);
      expect(requestManager.getRequestIdentifier).toHaveBeenCalledTimes(1);
      expect(fillManager!.waitForFulfillment).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendRequestTransaction()', () => {
    it('calls the transfer function on the request manager contract', async () => {
      const data = generateTransferData({
        amount: generateTokenAmountData({ amount: '1' }),
        sourceChain: generateChain({ requestManagerAddress: '0xRequestManager' }),
        sourceToken: generateToken({ address: '0xSourceToken' }),
        targetChain: generateChain({ identifier: 2 }),
        targetToken: generateToken({ address: '0xTargetToken' }),
        targetAccount: '0xTargetAccount',
        validityPeriod: generateUInt256Data('3'),
        fees: generateUInt256Data('4'),
      });
      const transfer = new TestTransfer(data);
      const signer = new JsonRpcSigner(undefined, new JsonRpcProvider());

      await transfer.sendRequestTransaction(signer, SIGNER_ADDRESS);

      expect(requestManager.sendRequestTransaction).toHaveBeenCalledTimes(1);
      expect(requestManager.sendRequestTransaction).toHaveBeenLastCalledWith(
        signer,
        new UInt256('1'),
        2,
        '0xRequestManager',
        '0xSourceToken',
        '0xTargetToken',
        '0xTargetAccount',
        new UInt256('3'),
        new UInt256('4'),
      );
    });

    it('sets the request account and transaction hash', async () => {
      const transfer = new TestTransfer(DATA);
      requestManager!.sendRequestTransaction = vi.fn().mockResolvedValue('0xHash');

      expect(transfer.requestMetadata?.requestAccount).toBeUndefined();
      expect(transfer.requestMetadata?.transactionHash).toBeUndefined();

      await transfer.sendRequestTransaction(SIGNER, '0xSigner');

      expect(transfer.requestMetadata?.requestAccount).toBe('0xSigner');
      expect(transfer.requestMetadata?.transactionHash).toBe('0xHash');
    });
  });

  describe('waitForRequestEvent()', () => {
    it('fails when transaction hash has not been set', async () => {
      const data = generateTransferData({
        requestMetadata: generateRequestMetadataData({ transactionHash: '' }),
      });
      const transfer = new TestTransfer(data);

      return expect(transfer.waitForRequestEvent()).rejects.toThrow(
        'Attempt to get request event before sending transaction!',
      );
    });

    it('connects to the source chain', async () => {
      const data = generateTransferData({
        sourceChain: generateChain({ rpcUrl: 'https://source.rpc' }),
        requestMetadata: generateRequestMetadataData(),
      });
      const transfer = new TestTransfer(data);

      await transfer.waitForRequestEvent();

      expect(JsonRpcProvider).toHaveBeenCalledTimes(1);
      expect(JsonRpcProvider).toHaveBeenLastCalledWith('https://source.rpc');
    });

    it('uses the stored request transaction hash', async () => {
      const data = generateTransferData({
        sourceChain: generateChain({ requestManagerAddress: '0xRequestManager' }),
        requestMetadata: generateRequestMetadataData({
          transactionHash: '0xHash',
        }),
      });
      const transfer = new TestTransfer(data);

      await transfer.waitForRequestEvent();

      expect(requestManager.getRequestIdentifier).toHaveBeenCalledTimes(1);
      expect(requestManager.getRequestIdentifier).toHaveBeenLastCalledWith(
        expect.any(JsonRpcProvider),
        '0xRequestManager',
        '0xHash',
      );
    });
  });

  describe('waitForFulfillment()', () => {
    it('fails when request identifier has not been set', async () => {
      const data = generateTransferData({
        requestMetadata: generateRequestMetadataData({
          identifier: undefined,
        }),
      });
      const transfer = new TestTransfer(data);

      return expect(transfer.waitForFulfillment()).rejects.toThrow(
        'Attempting to wait for fulfillment without request identifier!',
      );
    });

    it('connects to the target chain', async () => {
      const data = generateTransferData({
        targetChain: generateChain({ rpcUrl: 'https://target.rpc' }),
        requestMetadata: generateRequestMetadataData({
          identifier: generateUInt256Data('1'),
        }),
      });
      const transfer = new TestTransfer(data);

      await transfer.waitForFulfillment();

      expect(JsonRpcProvider).toHaveBeenCalledTimes(1);
      expect(JsonRpcProvider).toHaveBeenLastCalledWith('https://target.rpc');
    });

    it('uses the correct parameters to wait for the request fill', async () => {
      const data = generateTransferData({
        targetChain: generateChain({ fillManagerAddress: '0xFillManager' }),
        requestMetadata: generateRequestMetadataData({
          identifier: generateUInt256Data('1'),
        }),
      });
      const transfer = new TestTransfer(data);

      await transfer.waitForFulfillment();

      expect(fillManager.waitForFulfillment).toHaveBeenCalledTimes(1);
      expect(fillManager.waitForFulfillment).toHaveBeenLastCalledWith(
        expect.any(JsonRpcProvider),
        new UInt256('1'),
        '0xFillManager',
      );
    });
  });

  describe('encode()', () => {
    it('serializes all data to persist the whole transfer', () => {
      const amount = generateTokenAmountData();
      const sourceChain = generateChain();
      const sourceToken = generateToken();
      const targetChain = generateChain();
      const targetToken = generateToken();
      const targetAccount = getRandomEthereumAddress();
      const validityPeriod = generateUInt256Data();
      const fees = generateUInt256Data();
      const requestMetadata = generateRequestMetadataData();
      const requestFillMetadata = generateRequestFillMetadata();
      const steps = [generateStepData()];
      const data = {
        amount,
        sourceChain,
        sourceToken,
        targetChain,
        targetToken,
        targetAccount,
        validityPeriod,
        fees,
        requestMetadata,
        requestFillMetadata,
        steps,
      };
      const transfer = new TestTransfer(data);

      const encodedData = transfer.encode();

      expect(encodedData.amount).toMatchObject(amount);
      expect(encodedData.sourceChain).toMatchObject(sourceChain);
      expect(encodedData.sourceToken).toMatchObject(sourceToken);
      expect(encodedData.targetChain).toMatchObject(targetChain);
      expect(encodedData.targetToken).toMatchObject(targetToken);
      expect(encodedData.targetAccount).toMatchObject(targetAccount);
      expect(encodedData.validityPeriod).toMatchObject(validityPeriod);
      expect(encodedData.fees).toMatchObject(fees);
      expect(encodedData.requestMetadata).toMatchObject(requestMetadata);
      expect(encodedData.requestFillMetadata).toMatchObject(requestFillMetadata);
      expect(encodedData.steps).toMatchObject(steps);
    });

    it('can be used to re-instantiate transfer again', () => {
      const data = generateTransferData();
      const transfer = new TestTransfer(data);

      const encodedData = transfer.encode();
      const newTransfer = new TestTransfer(encodedData);
      const newEncodedData = newTransfer.encode();

      expect(encodedData).toMatchObject(newEncodedData);
    });
  });
});