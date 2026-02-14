
const handleDepositCollateral = async () => {
  // 1. Approve token
  await tokenContract.approve(
    COLLATERAL_MANAGER_ADDRESS, 
    collateralAmount
  );
  
  // 2. Deposit (balance decreases here!)
  const tx = await contracts.collateralManager.depositCollateral(
    loanId,           // Can be 0 for pre-deposit
    tokenAddress,
    collateralAmount
  );
  
  const receipt = await tx.wait();
  const depositId = /* extract from event */;
  
  alert(`Deposit successful! Your deposit ID is: ${depositId}`);
};