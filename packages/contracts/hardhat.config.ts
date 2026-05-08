import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import { HardhatUserConfig } from 'hardhat/config';

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'cancun',
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    galileo: {
      url: process.env.ZERO_G_GALILEO_RPC_URL ?? 'https://evmrpc-testnet.0g.ai',
      chainId: 16602,
      accounts,
    },
    aristotle: {
      url: process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai',
      chainId: 16661,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      galileo: process.env.CHAINSCAN_GALILEO_API_KEY ?? 'placeholder',
      aristotle: process.env.CHAINSCAN_ARISTOTLE_API_KEY ?? 'placeholder',
    },
    customChains: [
      {
        network: 'galileo',
        chainId: 16602,
        urls: {
          apiURL: 'https://chainscan-galileo.0g.ai/open/api',
          browserURL: 'https://chainscan-galileo.0g.ai',
        },
      },
      {
        network: 'aristotle',
        chainId: 16661,
        urls: { apiURL: 'https://chainscan.0g.ai/open/api', browserURL: 'https://chainscan.0g.ai' },
      },
    ],
  },
  typechain: { outDir: 'typechain-types', target: 'ethers-v6' },
  gasReporter: { enabled: true, currency: 'USD' },
};

export default config;
