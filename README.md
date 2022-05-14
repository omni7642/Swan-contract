# Swan treasury

This project is the implementation of the SwaaS treasury contract.
The partners use the SwanFactory contract to clone their own CustomSwanTreasury contract with some options such as principal token and target token. The they can deposit the principal token to the contract for the swan trading algorithm to trade with the funds and then make more target token.
The partners then can pre inform before 3 days of the current epoch and can withdraw their funds back from the treasury.

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
npx hardhat run scripts/deploy.ts
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
npx eslint '**/*.{js,ts}'
npx eslint '**/*.{js,ts}' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```
