# Swan treasury

This project is the implementation of the SwaaS treasury contract.
The partners use the SwanFactory contract to clone their own CustomSwanTreasury contract with some options such as tokens. The they can deposit some amount of tokens to the contract for the swan trading algorithm to trade with the funds and then make more target token.
The partners then can pre inform 3 days before the end of the current epoch and the chainlink keepers node broadcast the transaction that returns back to the partners.
The Swaas instead take the fee from the treasury contract at the end of every epoch as much as 20% of the profit during the epoch.

![](Swan%20contract.jpg)
Try running some of the following tasks:

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```
