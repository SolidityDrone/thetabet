export const ThetaSingletonAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "betToken_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "azuroLP_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "defaultCore_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "initialWhitelist_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "azuroLP",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAzuroLP"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "betIdByToken",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "betId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "betToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bets",
    "inputs": [
      {
        "name": "betId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "core",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "stake",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "conditionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "outcomeId",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "lifecycle",
        "type": "uint8",
        "internalType": "enum ThetaSingleton.BetLifecycle"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createVault",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "defaultCore",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAzuroCore"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deployer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "depositFor",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fan",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getVaultBet",
    "inputs": [
      {
        "name": "betId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ThetaSingleton.VaultBet",
        "components": [
          {
            "name": "vaultId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "core",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "stake",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "conditionId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "outcomeId",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "lifecycle",
            "type": "uint8",
            "internalType": "enum ThetaSingleton.BetLifecycle"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultBetIds",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isWhitelisted",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lookupTipsterByName",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "placeBet",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "core",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "order",
        "type": "tuple",
        "internalType": "struct IAzuroLP.OrderData",
        "components": [
          {
            "name": "betOwner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "conditionDatas",
            "type": "tuple[]",
            "internalType": "struct IAzuroLP.ConditionData[]",
            "components": [
              {
                "name": "gameId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "conditionId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "conditionKind",
                "type": "uint8",
                "internalType": "uint8"
              },
              {
                "name": "odds",
                "type": "uint64[]",
                "internalType": "uint64[]"
              },
              {
                "name": "outcomes",
                "type": "uint128[]",
                "internalType": "uint128[]"
              },
              {
                "name": "potentialLossLimit",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "winningOutcomesCount",
                "type": "uint8",
                "internalType": "uint8"
              }
            ]
          },
          {
            "name": "betType",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "oracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "clientBetData",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "bettorSignature",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "oracleSignature",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "tokenIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerTipsterName",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "pubKeyX",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "pubKeyY",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "removeWhitelistAddress",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleBet",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "betId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "payout",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "syncVault",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tipsterNameOwner",
    "inputs": [
      {
        "name": "nameHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tipsterNames",
    "inputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tipsterOf",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tipsterPubKeyX",
    "inputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "pubKeyX",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tipsterPubKeyY",
    "inputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "pubKeyY",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultFreeBalance",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultIdOfTipster",
    "inputs": [
      {
        "name": "tipster",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultOf",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultTotalAssets",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "whitelistAddress",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "whitelisted",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdrawAssets",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "fan",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "sharesBurned",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "TipsterNameRegistered",
    "inputs": [
      {
        "name": "tipster",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "pubKeyX",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "pubKeyY",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultBetClosed",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "betId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "azuroTokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "lifecycle",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "stake",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "payout",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "freeBalance",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultBetOpened",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tipster",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "betId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "azuroTokenId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "core",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "conditionId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "outcomeId",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "stake",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "freeBalance",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultCreated",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tipster",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultDeposit",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "investor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "sharesMinted",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "freeBalance",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shareSupply",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultMetrics",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "freeBalance",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shareSupply",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "openBets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "pendingClaimable",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "settledWins",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "settledLosses",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultWithdraw",
    "inputs": [
      {
        "name": "vaultId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "investor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sharesBurned",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "assetsOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "freeBalance",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalAssets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shareSupply",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WhitelistUpdated",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BetNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientFreeBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientLiquidity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidBetToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPublicKey",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTipsterName",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotWhitelisted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OneVaultPerTipster",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyDeployer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyTipster",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OnlyVault",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TipsterNameTaken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownVault",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;
