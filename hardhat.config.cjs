require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { 
        enabled: true, 
        runs: 200 
      },
      viaIR: true,  // 启用 IR 优化，解决 Stack too deep
    },
  },
  networks: {
    xlayer: {
      url: process.env.XLAYER_RPC || "https://rpc.xlayer.tech",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 196,
    },
    xlayer_testnet: {
      url: "https://testrpc.xlayer.tech",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1952,
    },
    xlayerMainnet: {
      url: "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 1000000000,
    },
  },
};
